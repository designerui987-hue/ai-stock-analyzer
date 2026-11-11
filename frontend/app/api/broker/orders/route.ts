import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/security/crypto';
import { kiteAdapter } from '@/lib/brokers/kite';
import { calculatePositionSize } from '@/lib/positionSizing';
import { isOrderRateLimited } from '@/lib/brokers/rateLimiter';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
// Market data fetched from unified FastAPI backend
import { z } from 'zod';

const OrderPostSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9_.-]+$/),
  transaction_type: z.enum(['BUY', 'SELL']),
  quantity: z.number().int().positive(),
  order_type: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  product_type: z.enum(['CNC', 'MIS', 'NRML']).default('CNC'),
  stop_loss_price: z.number().positive().optional(),
  target_price: z.number().positive().optional(),
  signal_id: z.string().optional(),
  user_confirmed: z.literal(true),
  mode: z.enum(['PAPER', 'LIVE']).default('PAPER'),
  live_trading_opt_in: z.boolean().default(false),
});

async function fetchServerLivePrice(symbol: string): Promise<number | null> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/stocks/quote/${encodeURIComponent(symbol)}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.price === 'number' && data.price > 0) return data.price;
    }
  } catch (err) {
    console.warn(`[Orders API] Could not fetch live price for ${symbol} via backend market data:`, err);
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const symbolFilter = searchParams.get('symbol');

    const where: any = { user_id: userId };
    if (statusFilter) where.status = statusFilter.toUpperCase();
    if (symbolFilter) where.symbol = symbolFilter.toUpperCase();

    const orders = await prisma.orderLog.findMany({
      where,
      orderBy: { placed_at: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, orders });
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
      transaction_type,
      quantity,
      order_type,
      product_type,
      stop_loss_price,
      target_price,
      signal_id,
      mode,
      live_trading_opt_in,
    } = parseResult.data;

    // 1. Fetch Real Live Price Server-Side (Required for both Paper & Live)

    const currentPrice = await fetchServerLivePrice(symbol);

    if (!currentPrice) {

      return NextResponse.json(

        { success: false, error: `Live market price for '${symbol}' is currently unavailable from exchange.` },

        { status: 503 }

      );

    }



    // 2. Paper Trading Default Path

    if (mode === 'PAPER') {

      const paperOrder = await prisma.orderLog.create({

        data: {

          user_id: userId,

          broker: 'PAPER',

          symbol: symbol.toUpperCase(),

          transaction_type: transaction_type.toUpperCase(),

          quantity: quantity,

          order_type: order_type.toUpperCase(),

          price: currentPrice,

          product_type: product_type.toUpperCase(),

          source: signal_id || 'PAPER_SIMULATION',

          broker_order_id: `PAPER_${Date.now()}`,

          status: 'COMPLETE',

          response_raw: JSON.stringify({

            mode: 'PAPER',

            execution: 'FILLED_AT_MARKET',

            fill_price: currentPrice,

            simulated_at: new Date().toISOString(),

          }),

        },

      });



      return NextResponse.json({

        success: true,

        mode: 'PAPER',

        message: `Paper order executed successfully for ${quantity}x ${symbol.toUpperCase()} at ₹${currentPrice.toFixed(2)}.`,

        order: paperOrder,

      });

    }



    // 3. Live Trading Guard: Require explicit per-user opt-in

    if (mode === 'LIVE' && !live_trading_opt_in) {

      return NextResponse.json(

        {

          success: false,

          error: 'Live Kite trading requires explicit opt-in confirmation. Real capital will not be committed without explicit acknowledgment.',

        },

        { status: 403 }

      );

    }



    // 4. Validate Active Broker Connection (for LIVE mode)
    const conn = await prisma.brokerConnection.findUnique({
      where: { user_id: userId },
    });

    if (!conn || conn.status !== 'CONNECTED' || conn.token_expires_at < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Broker connection missing or expired. Please connect Zerodha Kite in /settings.' },
        { status: 403 }
      );
    }

    // 2. Rate Limiting Check (Max 1 order per symbol per 60 sec)
    if (isOrderRateLimited(userId, symbol)) {
      return NextResponse.json(
        { success: false, error: `Rate limit: Only 1 order per symbol allowed per 60 seconds. Please wait before retrying for ${symbol}.` },
        { status: 429 }
      );
    }

    // 4. Margin / Funds Check from Real Kite API
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

    // Derive account capital from real broker funds (total collateral or available cash + used margin)
    const accountCapital = margin.total_collateral || (margin.available_cash + margin.used_margin);
    if (!accountCapital || accountCapital <= 0) {
      return NextResponse.json(
        { success: false, error: 'Broker reports zero or unavailable account capital. Ensure your account is funded.' },
        { status: 400 }
      );
    }

    // 5. Server-Side Risk Re-Validation against real capital
    const slPrice = stop_loss_price || currentPrice * 0.95;
    const tgPrice = target_price || currentPrice * 1.10;
    const maxRiskPct = 1.0; // Standard 1% risk rule threshold

    const sizing = calculatePositionSize({
      account_capital: accountCapital,
      risk_pct: maxRiskPct,
      entry_price: currentPrice,
      stop_loss_price: slPrice,
      target_price: tgPrice,
      symbol: symbol,
    });

    const requestedOrderValue = currentPrice * quantity;
    const estimatedRiskPerShare = Math.abs(currentPrice - slPrice);
    const requestedMaxRisk = estimatedRiskPerShare * quantity;
    const maxAllowedRisk = accountCapital * (maxRiskPct / 100);

    if (requestedMaxRisk > maxAllowedRisk * 1.1) {
      // 10% slippage allowance
      const errorMsg = `Server Risk Violation: Requested position risk (₹${Math.round(requestedMaxRisk)}) exceeds max allowed risk threshold (₹${Math.round(maxAllowedRisk)}, ${maxRiskPct}% of capital ₹${Math.round(accountCapital)}). Max recommended size is ${sizing.position_size_shares} shares/lots.`;
      
      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          symbol: symbol.toUpperCase(),
          transaction_type: transaction_type.toUpperCase(),
          quantity: quantity,
          order_type: order_type.toUpperCase(),
          price: currentPrice,
          product_type: product_type.toUpperCase(),
          source: signal_id || null,
          status: 'REJECTED',
          response_raw: JSON.stringify({ error: errorMsg, requestedMaxRisk, maxAllowedRisk, accountCapital }),
        },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 422 });
    }

    if (margin.available_cash < requestedOrderValue && product_type === 'CNC') {
      const errorMsg = `Insufficient Cash Margin: Required ₹${requestedOrderValue.toLocaleString()} but available cash is ₹${margin.available_cash.toLocaleString()}.`;
      
      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          symbol: symbol.toUpperCase(),
          transaction_type: transaction_type.toUpperCase(),
          quantity: quantity,
          order_type: order_type.toUpperCase(),
          price: currentPrice,
          product_type: product_type.toUpperCase(),
          source: signal_id || null,
          status: 'REJECTED',
          response_raw: JSON.stringify({ error: errorMsg, available_cash: margin.available_cash }),
        },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    // 6. Submit Order via Adapter
    const orderRes = await kiteAdapter.placeOrder(rawToken, {
      symbol: symbol.toUpperCase(),
      transaction_type: transaction_type as any,
      quantity: quantity,
      order_type: order_type as any,
      product_type: product_type as any,
      price: currentPrice,
      signal_id: signal_id,
    });

    // 7. Audit Log Append
    const logEntry = await prisma.orderLog.create({
      data: {
        user_id: userId,
        broker: 'KITE',
        symbol: symbol.toUpperCase(),
        transaction_type: transaction_type.toUpperCase(),
        quantity: quantity,
        order_type: order_type.toUpperCase(),
        price: currentPrice,
        product_type: product_type.toUpperCase(),
        source: signal_id || null,
        broker_order_id: orderRes.broker_order_id || null,
        status: orderRes.status,
        response_raw: JSON.stringify(orderRes.raw_response || { message: orderRes.message }),
      },
    });

    if (!orderRes.success) {
      return NextResponse.json({ success: false, error: orderRes.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Order executed successfully with Zerodha Kite Connect!',
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
