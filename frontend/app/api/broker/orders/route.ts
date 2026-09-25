import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/security/crypto';
import { kiteAdapter } from '@/lib/brokers/kite';
import { calculatePositionSize } from '@/lib/positionSizing';
import { isOrderRateLimited } from '@/lib/brokers/rateLimiter';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'demo_user';
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
    console.error('Fetch order blotter error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId = 'demo_user',
      symbol,
      transaction_type,
      quantity,
      order_type = 'MARKET',
      product_type = 'CNC',
      price,
      stop_loss_price,
      target_price,
      signal_id,
      user_confirmed = false,
    } = body;

    // 1. Explicit User Confirmation Guard (Non-negotiable compliance rule)
    if (!user_confirmed) {
      return NextResponse.json(
        { success: false, error: 'Explicit user confirmation in modal is required before placing order.' },
        { status: 400 }
      );
    }

    if (!symbol || !quantity || quantity <= 0) {
      return NextResponse.json({ success: false, error: 'Valid symbol and positive quantity required.' }, { status: 400 });
    }

    // 2. Validate Active Broker Connection
    const conn = await prisma.brokerConnection.findUnique({
      where: { user_id: userId },
    });

    if (!conn || conn.status !== 'CONNECTED' || conn.token_expires_at < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Broker connection missing or expired. Please reconnect Zerodha Kite in /settings.' },
        { status: 403 }
      );
    }

    // 3. Rate Limiting Check (Max 1 order per symbol per 60 sec)
    if (isOrderRateLimited(userId, symbol)) {
      return NextResponse.json(
        { success: false, error: `Rate limit: Only 1 order per symbol allowed per 60 seconds. Please wait before retrying for ${symbol}.` },
        { status: 429 }
      );
    }

    // 4. Server-Side Risk Re-Validation (Never trust client-submitted quantity/risk alone)
    const currentPrice = price || 1000;
    const slPrice = stop_loss_price || currentPrice * 0.95;
    const tgPrice = target_price || currentPrice * 1.10;

    const accountCapital = 1183500; // Baseline account capital
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
      // Allow 10% slippage tolerance
      const errorMsg = `Server Risk Violation: Requested position risk (₹${Math.round(requestedMaxRisk)}) exceeds max allowed risk threshold (₹${Math.round(maxAllowedRisk)}, ${maxRiskPct}% of capital). Max recommended size is ${sizing.position_size_shares} shares/lots.`;
      
      // Audit log the rejected attempt
      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          symbol: symbol.toUpperCase(),
          transaction_type: transaction_type.toUpperCase(),
          quantity: parseInt(quantity, 10),
          order_type: order_type.toUpperCase(),
          price: currentPrice,
          product_type: product_type.toUpperCase(),
          source: signal_id || null,
          status: 'REJECTED',
          response_raw: JSON.stringify({ error: errorMsg, requestedMaxRisk, maxAllowedRisk }),
        },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 422 });
    }

    // 5. Margin / Funds Check
    const rawToken = decryptToken(conn.access_token);
    const margin = await kiteAdapter.getFunds(rawToken);
    if (margin.available_cash < requestedOrderValue && product_type === 'CNC') {
      const errorMsg = `Insufficient Cash Margin: Required ₹${requestedOrderValue.toLocaleString()} but available cash is ₹${margin.available_cash.toLocaleString()}.`;
      
      await prisma.orderLog.create({
        data: {
          user_id: userId,
          broker: 'KITE',
          symbol: symbol.toUpperCase(),
          transaction_type: transaction_type.toUpperCase(),
          quantity: parseInt(quantity, 10),
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
      transaction_type: transaction_type.toUpperCase() as any,
      quantity: parseInt(quantity, 10),
      order_type: order_type.toUpperCase() as any,
      product_type: product_type.toUpperCase() as any,
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
        quantity: parseInt(quantity, 10),
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
    console.error('Order placement error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
