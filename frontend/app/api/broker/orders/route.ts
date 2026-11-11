import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/security/crypto';
import { kiteAdapter } from '@/lib/brokers/kite';
import { OrderStatus } from '@/lib/brokers/interface';
import { calculatePositionSize } from '@/lib/positionSizing';
import { isOrderRateLimited } from '@/lib/brokers/rateLimiter';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { getServerBackendUrl } from '@/lib/api';
import {
  evaluateNseSession,
  validateQuoteForOrder,
  simulatePaperExecution,
  ServerQuotePayload,
} from '@/lib/orders/execution';
import { z } from 'zod';

const OrderPostSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9_.-]+$/),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  transaction_type: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  order_type: z.enum(['MARKET', 'LIMIT', 'SL', 'SL_M']).default('MARKET'),
  product_type: z.enum(['CNC', 'MIS', 'NRML']).default('CNC'),
  limit_price: z.number().positive().optional(),
  trigger_price: z.number().positive().optional(),
  expected_price: z.number().positive().optional(),
  max_slippage_pct: z.number().min(0.05).max(5).default(1.0),
  stop_loss_price: z.number().positive().optional(),
  target_price: z.number().positive().optional(),
  signal_id: z.string().optional(),
  user_confirmed: z.literal(true),
  mode: z.enum(['PAPER', 'LIVE']).default('PAPER'),
  live_trading_opt_in: z.boolean().default(false),
  confirm_live_ticket: z.boolean().default(false),
  idempotency_key: z.string().min(8).max(128).optional(),
});

const OrderReconcileSchema = z.object({
  order_id: z.string().min(1),
});

function normalizeStatus(st: OrderStatus | string): string {
  const upper = String(st || '').toUpperCase();
  if (upper === 'COMPLETE' || upper === 'FILLED') return 'FILLED';
  if (upper === 'PLACED' || upper === 'OPEN') return 'OPEN';
  if (upper === 'PARTIAL') return 'PARTIAL';
  if (upper === 'REJECTED') return 'REJECTED';
  if (upper === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

async function fetchServerQuote(
  symbol: string,
  exchange: 'NSE' | 'BSE',
  authHeader: string | null
): Promise<ServerQuotePayload | null> {
  try {
    const backendUrl = getServerBackendUrl();
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    const url = `${backendUrl}/api/stocks/quote/${encodeURIComponent(symbol)}?exchange=${encodeURIComponent(exchange)}&skip_cache=true`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as ServerQuotePayload;
  } catch (err) {
    console.warn(`[Orders API] Could not fetch server quote for ${exchange}:${symbol}:`, err);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const symbolFilter = searchParams.get('symbol');
    const modeFilter = searchParams.get('mode');

    const where: Record<string, unknown> = { user_id: userId };
    if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
      where.status = statusFilter.toUpperCase();
    }
    if (symbolFilter) {
      where.symbol = symbolFilter.toUpperCase();
    }
    if (modeFilter && (modeFilter.toUpperCase() === 'PAPER' || modeFilter.toUpperCase() === 'LIVE')) {
      where.mode = modeFilter.toUpperCase();
    }

    const orders = await prisma.orderLog.findMany({
      where,
      orderBy: { placed_at: 'desc' },
      take: 100,
    });

    const paper_orders = orders.filter((o: any) => (o.mode || (o.broker === 'PAPER' ? 'PAPER' : 'LIVE')) === 'PAPER');
    const live_orders = orders.filter((o: any) => (o.mode || (o.broker === 'PAPER' ? 'PAPER' : 'LIVE')) === 'LIVE');

    return NextResponse.json({
      success: true,
      live_trading_enabled: process.env.ENABLE_LIVE_TRADING === 'true',
      orders,
      paper_orders,
      live_orders,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Fetch order blotter error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const rawBody = await req.json();
    const parseResult = OrderPostSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const {
      symbol,
      exchange,
      transaction_type,
      quantity,
      order_type,
      product_type,
      limit_price,
      trigger_price,
      expected_price,
      max_slippage_pct,
      stop_loss_price,
      target_price,
      signal_id,
      mode,
      live_trading_opt_in,
      confirm_live_ticket,
      idempotency_key: bodyIdemKey,
    } = parseResult.data;

    const sym = symbol.toUpperCase();
    const exch = exchange;
    const headerIdemKey = req.headers.get('idempotency-key') || req.headers.get('x-idempotency-key');
    const idempotencyKey = (headerIdemKey || bodyIdemKey || '').trim() || null;

    // 1. Idempotency deduplication before any execution
    if (idempotencyKey && typeof (prisma.orderLog as any).findFirst === 'function') {
      const existing = await (prisma.orderLog as any).findFirst({
        where: { user_id: userId, idempotency_key: idempotencyKey },
      });
      if (existing) {
        return NextResponse.json({
          success: existing.status !== 'REJECTED',
          deduplicated: true,
          mode: existing.mode || mode,
          message: 'Duplicate submission deduplicated via Idempotency-Key.',
          order: existing,
        });
      }
    }

    // 2. Hard Server-Side Gate for Real-Money LIVE Trading
    if (mode === 'LIVE') {
      if (process.env.ENABLE_LIVE_TRADING !== 'true') {
        return NextResponse.json(
          {
            success: false,
            error:
              'Live real-money order execution is disabled on this server (ENABLE_LIVE_TRADING is not enabled). Use PAPER mode for simulation.',
          },
          { status: 403 }
        );
      }
      if (!live_trading_opt_in || !confirm_live_ticket) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Live Kite trading requires explicit opt-in acknowledgment and live order ticket confirmation.',
          },
          { status: 403 }
        );
      }
    }

    // 3. Validate order type constraints upfront
    if (order_type === 'LIMIT' && (!limit_price || limit_price <= 0)) {
      return NextResponse.json(
        { success: false, error: 'LIMIT orders require a positive limit_price.' },
        { status: 400 }
      );
    }
    if ((order_type === 'SL' || order_type === 'SL_M') && (!trigger_price || trigger_price <= 0)) {
      return NextResponse.json(
        { success: false, error: `${order_type} orders require a positive trigger_price.` },
        { status: 400 }
      );
    }

    // 4. Fetch fresh server-side quote (skip_cache=true) and verify freshness
    const rawQuote = await fetchServerQuote(sym, exch, req.headers.get('authorization'));
    const maxAgeSeconds = Number(process.env.FEED_QUOTE_MAX_AGE_SECONDS || '60');
    const quoteCheck = validateQuoteForOrder(rawQuote, {
      expectedSymbol: sym,
      expectedExchange: exch,
      maxAgeSeconds: Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds : 60,
    });

    if (!quoteCheck.valid || !quoteCheck.price) {
      return NextResponse.json(
        {
          success: false,
          error: quoteCheck.reason || `Market price for '${exch}:${sym}' is unavailable or stale.`,
        },
        { status: 503 }
      );
    }

    const currentPrice = quoteCheck.price;

    // 5. Slippage deviation guard when caller supplies expected preview price
    if (expected_price && expected_price > 0) {
      const movePct = (Math.abs(currentPrice - expected_price) / expected_price) * 100;
      if (movePct > max_slippage_pct) {
        return NextResponse.json(
          {
            success: false,
            error: `Quote moved ${movePct.toFixed(2)}% from preview price ₹${expected_price.toFixed(2)} to ₹${currentPrice.toFixed(2)} (max_slippage_pct=${max_slippage_pct}%). Refresh quote before submitting.`,
          },
          { status: 409 }
        );
      }
    }

    const sessionInfo = evaluateNseSession();

    // 6. Paper Trading Simulation Path (strictly isolated ledger)
    if (mode === 'PAPER') {
      const sim = simulatePaperExecution({
        transaction_type,
        order_type,
        product_type,
        quantity,
        quotePrice: currentPrice,
        limitPrice: limit_price,
        triggerPrice: trigger_price,
        marketOpen: sessionInfo.open,
        marketSession: sessionInfo.session,
      });

      if (sim.status === 'REJECTED') {
        const rejectedLog = await prisma.orderLog.create({
          data: {
            user_id: userId,
            broker: 'PAPER',
            mode: 'PAPER',
            exchange: exch,
            symbol: sym,
            transaction_type,
            quantity,
            order_type,
            price: limit_price ?? currentPrice,
            trigger_price: trigger_price ?? null,
            product_type,
            source: signal_id || 'PAPER_SIMULATION',
            broker_order_id: `PAPER_${Date.now()}`,
            idempotency_key: idempotencyKey,
            quote_as_of: quoteCheck.asOf || null,
            slippage_bps: 0,
            fees_inr: 0,
            status: 'REJECTED',
            response_raw: JSON.stringify({
              mode: 'PAPER',
              market_session: sessionInfo.session,
              quote_source: quoteCheck.source,
              quote_as_of: quoteCheck.asOf,
              reason: sim.reason,
            }),
          },
        });
        return NextResponse.json(
          { success: false, mode: 'PAPER', error: sim.reason, order: rejectedLog },
          { status: 422 }
        );
      }

      const paperOrder = await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'PAPER',
          mode: 'PAPER',
          exchange: exch,
          symbol: sym,
          transaction_type,
          quantity,
          order_type,
          price: sim.execution_price ?? limit_price ?? currentPrice,
          trigger_price: trigger_price ?? null,
          product_type,
          source: signal_id || 'PAPER_SIMULATION',
          broker_order_id: `PAPER_${Date.now()}`,
          idempotency_key: idempotencyKey,
          quote_as_of: quoteCheck.asOf || null,
          slippage_bps: sim.slippage_bps,
          fees_inr: sim.fees_inr,
          status: sim.status,
          response_raw: JSON.stringify({
            mode: 'PAPER',
            market_session: sessionInfo.session,
            quote_source: quoteCheck.source,
            quote_as_of: quoteCheck.asOf,
            fill_price: sim.execution_price,
            slippage_bps: sim.slippage_bps,
            fees_inr: sim.fees_inr,
            fee_breakdown: sim.fee_breakdown || null,
            reason: sim.reason,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        mode: 'PAPER',
        message: sim.reason,
        order: paperOrder,
      });
    }

    // 7. LIVE Trading Guards: Require open NSE continuous session
    if (!sessionInfo.open) {
      return NextResponse.json(
        {
          success: false,
          error: `Live order rejected: ${sessionInfo.reason || `NSE session is ${sessionInfo.session}.`}`,
        },
        { status: 409 }
      );
    }

    // 8. Validate Active Broker Connection (LIVE only)
    const conn = await prisma.brokerConnection.findUnique({
      where: { user_id: userId },
    });

    if (!conn || conn.status !== 'CONNECTED' || conn.token_expires_at < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Broker connection missing or expired. Please connect Zerodha Kite in /settings.' },
        { status: 403 }
      );
    }

    // 9. Rate Limiting Check
    if (isOrderRateLimited(userId, sym)) {
      return NextResponse.json(
        { success: false, error: `Rate limit: Only 1 order per symbol allowed per 60 seconds for ${sym}.` },
        { status: 429 }
      );
    }

    // 10. Real Margin / Funds & Server-Side Risk Check
    const rawToken = decryptToken(conn.access_token);
    let margin;
    try {
      margin = await kiteAdapter.getFunds(rawToken);
    } catch (fundsErr: any) {
      return NextResponse.json(
        { success: false, error: `Failed to retrieve account funds from broker: ${fundsErr.message}` },
        { status: 502 }
      );
    }

    const accountCapital = margin.total_collateral || margin.available_cash + margin.used_margin;
    if (!accountCapital || accountCapital <= 0) {
      return NextResponse.json(
        { success: false, error: 'Broker reports zero or unavailable account capital.' },
        { status: 400 }
      );
    }

    const slPrice = stop_loss_price || currentPrice * 0.95;
    const tgPrice = target_price || currentPrice * 1.1;
    const maxRiskPct = 1.0;

    const sizing = calculatePositionSize({
      account_capital: accountCapital,
      risk_pct: maxRiskPct,
      entry_price: currentPrice,
      stop_loss_price: slPrice,
      target_price: tgPrice,
      symbol: sym,
    });

    const requestedOrderValue = currentPrice * quantity;
    const estimatedRiskPerShare = Math.abs(currentPrice - slPrice);
    const requestedMaxRisk = estimatedRiskPerShare * quantity;
    const maxAllowedRisk = accountCapital * (maxRiskPct / 100);

    if (requestedMaxRisk > maxAllowedRisk * 1.1) {
      const errorMsg = `Server Risk Violation: Requested position risk (₹${Math.round(requestedMaxRisk)}) exceeds max allowed risk threshold (₹${Math.round(maxAllowedRisk)}, ${maxRiskPct}% of capital ₹${Math.round(accountCapital)}). Max recommended size is ${sizing.position_size_shares} shares.`;

      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          mode: 'LIVE',
          exchange: exch,
          symbol: sym,
          transaction_type,
          quantity,
          order_type,
          price: currentPrice,
          trigger_price: trigger_price ?? null,
          product_type,
          source: signal_id || null,
          idempotency_key: idempotencyKey,
          quote_as_of: quoteCheck.asOf || null,
          status: 'REJECTED',
          response_raw: JSON.stringify({ error: errorMsg, requestedMaxRisk, maxAllowedRisk, accountCapital }),
        },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 422 });
    }

    if (transaction_type === 'BUY' && margin.available_cash < requestedOrderValue && product_type === 'CNC') {
      const errorMsg = `Insufficient Cash Margin: Required ₹${requestedOrderValue.toLocaleString()} but available cash is ₹${margin.available_cash.toLocaleString()}.`;

      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          mode: 'LIVE',
          exchange: exch,
          symbol: sym,
          transaction_type,
          quantity,
          order_type,
          price: currentPrice,
          trigger_price: trigger_price ?? null,
          product_type,
          source: signal_id || null,
          idempotency_key: idempotencyKey,
          quote_as_of: quoteCheck.asOf || null,
          status: 'REJECTED',
          response_raw: JSON.stringify({ error: errorMsg, available_cash: margin.available_cash }),
        },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    // 11. Submit LIVE Order via Kite Adapter with deterministic reconciliation tag
    const orderTag = `ai_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    let orderRes = await kiteAdapter.placeOrder(rawToken, {
      symbol: sym,
      exchange: exch,
      transaction_type,
      quantity,
      order_type,
      product_type,
      price: order_type === 'LIMIT' ? limit_price : currentPrice,
      trigger_price,
      signal_id,
      tag: orderTag,
    });

    // Immediate tag reconciliation if network/gateway returned UNKNOWN ambiguity
    if (orderRes.status === 'UNKNOWN') {
      const reconciled = await kiteAdapter.findOrderByTag(rawToken, orderTag);
      if (reconciled) {
        orderRes = {
          success: reconciled.status !== 'REJECTED' && reconciled.status !== 'CANCELLED',
          broker_order_id: reconciled.order_id,
          status: reconciled.status,
          message: `Reconciled ambiguous order via tag ${orderTag}: ${reconciled.status}`,
          raw_response: { reconciled_by_tag: orderTag, reconciled },
        };
      }
    }

    const persistedStatus = normalizeStatus(orderRes.status);

    const logEntry = await prisma.orderLog.create({
      data: {
        user_id: userId,
        broker: 'KITE',
        mode: 'LIVE',
        exchange: exch,
        symbol: sym,
        transaction_type,
        quantity,
        order_type,
        price: order_type === 'LIMIT' ? limit_price : currentPrice,
        trigger_price: trigger_price ?? null,
        product_type,
        source: signal_id || null,
        broker_order_id: orderRes.broker_order_id || null,
        idempotency_key: idempotencyKey,
        quote_as_of: quoteCheck.asOf || null,
        status: persistedStatus,
        response_raw: JSON.stringify({
          tag: orderTag,
          quote_source: quoteCheck.source,
          quote_as_of: quoteCheck.asOf,
          broker_response: orderRes.raw_response || { message: orderRes.message },
        }),
      },
    });

    if (orderRes.status === 'UNKNOWN') {
      return NextResponse.json(
        {
          success: false,
          ambiguous: true,
          status: 'UNKNOWN',
          order: logEntry,
          error:
            'Broker order acknowledgment timed out or returned UNKNOWN ambiguity. Do not blindly retry; use Reconcile Status in the Orders blotter.',
        },
        { status: 202 }
      );
    }

    if (!orderRes.success) {
      return NextResponse.json({ success: false, error: orderRes.message, order: logEntry }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mode: 'LIVE',
      message: 'Live order acknowledged by Zerodha Kite Connect.',
      order: logEntry,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Order placement error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const body = await req.json();
    const parsed = OrderReconcileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid reconcile payload.' }, { status: 400 });
    }

    const order = await prisma.orderLog.findFirst({
      where: { id: parsed.data.order_id, user_id: userId },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    if ((order as any).mode !== 'LIVE' || order.broker !== 'KITE') {
      return NextResponse.json({
        success: true,
        order,
        message: 'Paper orders do not require broker API reconciliation.',
      });
    }

    const conn = await prisma.brokerConnection.findUnique({
      where: { user_id: userId },
    });
    if (!conn || conn.status !== 'CONNECTED' || conn.token_expires_at < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Active Zerodha Kite connection required to reconcile order status.' },
        { status: 403 }
      );
    }

    const rawToken = decryptToken(conn.access_token);
    let parsedRaw: any = {};
    try {
      parsedRaw = JSON.parse(order.response_raw || '{}');
    } catch {
      parsedRaw = {};
    }

    let nextStatus: OrderStatus = 'UNKNOWN';
    let brokerOrderId = order.broker_order_id;

    if (brokerOrderId) {
      nextStatus = await kiteAdapter.getOrderStatus(rawToken, brokerOrderId);
    } else if (parsedRaw?.tag) {
      const found = await kiteAdapter.findOrderByTag(rawToken, parsedRaw.tag);
      if (found) {
        brokerOrderId = found.order_id;
        nextStatus = found.status;
      }
    }

    const normalized = normalizeStatus(nextStatus);
    const updated = await prisma.orderLog.update({
      where: { id: order.id },
      data: {
        broker_order_id: brokerOrderId,
        status: normalized,
        response_raw: JSON.stringify({
          ...parsedRaw,
          reconciled_at: new Date().toISOString(),
          reconciled_status: nextStatus,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      order: updated,
      message: `Reconciled order status: ${normalized}`,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Order reconciliation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
