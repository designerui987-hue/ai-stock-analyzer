/**
 * Paper Limit Order Lifecycle Tests
 *
 * Requirements:
 * "The app can save an unmarketable paper limit order as OPEN. Complete the path that evaluates it when fresh quotes arrive."
 * "- Keep the order open until a fresh quote for the correct instrument and exchange satisfies the limit during an eligible market session."
 * "- At a buy limit, fill at the limit or lower. At a sell limit, fill at the limit or higher."
 * "- Persist the fill and update the paper ledger atomically. Prevent duplicate fills and fees when quote events repeat, workers overlap, or the service restarts."
 * "- Show the transition from OPEN to FILLED in the order blotter. Verify that stale quotes and closed sessions cannot trigger a fill."
 */

import assert from 'node:assert';
import {
  checkPaperLimitSatisfaction,
  executePaperLimitFill,
  ServerQuotePayload,
} from './orders/execution';

// Regular trading hours UTC: 2026-11-18T05:00:00Z = 10:30 AM IST (Wednesday)
const REGULAR_SESSION_DATE = new Date('2026-11-18T05:00:00Z');
// Weekend UTC: 2026-11-15T05:00:00Z = Sunday
const WEEKEND_DATE = new Date('2026-11-15T05:00:00Z');

async function runPaperLimitLifecycleTests() {
  console.log('Running Paper Limit Order Lifecycle Tests...');

  // 1. BUY LIMIT Order tests
  const buyLimitOrder = {
    id: 'ord-buy-001',
    symbol: 'RELIANCE',
    exchange: 'NSE',
    transaction_type: 'BUY' as const,
    quantity: 10,
    order_type: 'LIMIT',
    product_type: 'CNC',
    price: 2500.0, // Limit = 2500
  };

  // Case A: Quote is above buy limit (Unmarketable -> remains OPEN)
  const unmarketableBuyQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2550.0, // 2550 > 2500
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };

  const buyResA = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: unmarketableBuyQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(buyResA.satisfied, false, 'Buy limit must not satisfy when LTP > limit');
  assert.ok(buyResA.reason.includes('resting OPEN'), 'Reason should indicate resting OPEN');
  console.log('✓ Buy limit rests OPEN when quote price exceeds limit price');

  // Case B: Fresh Quote touches/drops below buy limit (Marketable -> FILLED at <= limit)
  const marketableBuyQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2490.0, // 2490 <= 2500
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };

  const buyResB = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: marketableBuyQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(buyResB.satisfied, true, 'Buy limit must satisfy when LTP <= limit');
  assert.ok(buyResB.fillPrice !== undefined && buyResB.fillPrice <= buyLimitOrder.price, 'Fill price must be at limit or lower');
  assert.ok(buyResB.fees !== undefined && buyResB.fees > 0, 'Statutory fees must be computed');
  console.log(`✓ Buy limit satisfied: fillPrice ₹${buyResB.fillPrice} <= limit ₹${buyLimitOrder.price}, fees ₹${buyResB.fees}`);

  // 2. SELL LIMIT Order tests
  const sellLimitOrder = {
    id: 'ord-sell-001',
    symbol: 'TCS',
    exchange: 'NSE',
    transaction_type: 'SELL' as const,
    quantity: 5,
    order_type: 'LIMIT',
    product_type: 'CNC',
    price: 4000.0, // Limit = 4000
  };

  // Case A: Quote is below sell limit (Unmarketable -> remains OPEN)
  const unmarketableSellQuote: ServerQuotePayload = {
    symbol: 'TCS',
    exchange: 'NSE',
    price: 3950.0, // 3950 < 4000
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };

  const sellResA = checkPaperLimitSatisfaction({
    order: sellLimitOrder,
    quote: unmarketableSellQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(sellResA.satisfied, false, 'Sell limit must not satisfy when LTP < limit');
  assert.ok(sellResA.reason.includes('resting OPEN'), 'Reason should indicate resting OPEN');
  console.log('✓ Sell limit rests OPEN when quote price is below limit price');

  // Case B: Fresh Quote touches/rises above sell limit (Marketable -> FILLED at >= limit)
  const marketableSellQuote: ServerQuotePayload = {
    symbol: 'TCS',
    exchange: 'NSE',
    price: 4050.0, // 4050 >= 4000
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };

  const sellResB = checkPaperLimitSatisfaction({
    order: sellLimitOrder,
    quote: marketableSellQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(sellResB.satisfied, true, 'Sell limit must satisfy when LTP >= limit');
  assert.ok(sellResB.fillPrice !== undefined && sellResB.fillPrice >= sellLimitOrder.price, 'Fill price must be at limit or higher');
  assert.ok(sellResB.fees !== undefined && sellResB.fees > 0, 'Statutory fees must be computed');
  console.log(`✓ Sell limit satisfied: fillPrice ₹${sellResB.fillPrice} >= limit ₹${sellLimitOrder.price}, fees ₹${sellResB.fees}`);

  // 3. Stale quote check: quote timestamp > 60 seconds old must NOT trigger a fill
  const staleQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2480.0,
    source: 'live_feed',
    as_of: new Date(REGULAR_SESSION_DATE.getTime() - 120_000).toISOString(), // 2 minutes old
  };

  const staleRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: staleQuote,
    nowUtc: REGULAR_SESSION_DATE,
    maxAgeSeconds: 60,
  });
  assert.strictEqual(staleRes.satisfied, false, 'Stale quote must not trigger a fill');
  assert.ok(staleRes.reason.includes('stale'), 'Reason should identify stale quote');
  console.log('✓ Stale quote rejected; cannot trigger fill');

  // 4. Closed session check: market closed cannot trigger fill
  const closedSessionRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: marketableBuyQuote,
    nowUtc: WEEKEND_DATE, // Weekend
  });
  assert.strictEqual(closedSessionRes.satisfied, false, 'Closed market session must not trigger a fill');
  assert.ok(closedSessionRes.reason.includes('WEEKEND') || closedSessionRes.reason.includes('closed'));
  console.log('✓ Closed NSE session rejected; cannot trigger fill');

  // 5. Exchange integrity check: BSE quote cannot fill NSE order
  const bseQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'BSE', // Different exchange!
    price: 2480.0,
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };
  const exchMismatchRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder, // expected exchange: NSE
    quote: bseQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(exchMismatchRes.satisfied, false, 'Exchange mismatch must not satisfy');
  assert.ok(exchMismatchRes.reason.includes('Exchange mismatch'));
  console.log('✓ Cross-exchange quote mismatch rejected');

  // 6. Concurrency & Idempotent Fill execution test (Prevent duplicate fills & fees)
  class MockPrismaOrderLog {
    public orders = new Map<string, any>();

    constructor() {
      this.orders.set('ord-buy-001', {
        id: 'ord-buy-001',
        user_id: 'paper-test-a',
        mode: 'PAPER',
        broker: 'PAPER',
        symbol: 'RELIANCE',
        exchange: 'NSE',
        transaction_type: 'BUY',
        quantity: 10,
        order_type: 'LIMIT',
        product_type: 'CNC',
        price: 2500,
        status: 'OPEN',
        fees_inr: 0,
        placed_at: new Date(REGULAR_SESSION_DATE.getTime() - 5000),
      });
      this.orders.set('ord-other-user', {
        ...this.orders.get('ord-buy-001'),
        id: 'ord-other-user',
        user_id: 'paper-test-b',
      });
    }

    async findMany(query?: any) {
      const all = Array.from(this.orders.values());
      return all.filter((o) => {
        if (query?.where?.user_id && o.user_id !== query.where.user_id) return false;
        if (query?.where?.symbol && o.symbol !== query.where.symbol) return false;
        if (query?.where?.exchange && o.exchange !== query.where.exchange) return false;
        if (query?.where?.status && o.status !== query.where.status) return false;
        if (query?.where?.mode && o.mode && o.mode !== query.where.mode) return false;
        if (query?.where?.order_type && o.order_type !== query.where.order_type) return false;
        return true;
      });
    }

    async updateMany(query: { where: Record<string, string>; data: any }) {
      const order = this.orders.get(query.where.id);
      if (!order || !Object.entries(query.where).every(([key, value]) => order[key] === value)) {
        return { count: 0 };
      }
      order.status = query.data.status;
      order.fees_inr = query.data.fees_inr;
      order.price = query.data.price;
      return { count: 1 };
    }
  }

  const mockPrisma = { orderLog: new MockPrismaOrderLog() };

  // First fill execution
  const fill1 = await executePaperLimitFill(mockPrisma, {
    orderId: 'ord-buy-001',
    userId: 'paper-test-a',
    fillPrice: 2491.25,
    fees: 14.95,
    sessionName: 'REGULAR',
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(fill1.filled, true, 'First fill must succeed');
  assert.strictEqual(fill1.count, 1);

  // Duplicate / repeat quote event / overlapping worker fill execution
  const fill2 = await executePaperLimitFill(mockPrisma, {
    orderId: 'ord-buy-001',
    userId: 'paper-test-a',
    fillPrice: 2491.25,
    fees: 14.95,
    sessionName: 'REGULAR',
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(fill2.filled, false, 'Duplicate fill attempt must be ignored');
  assert.strictEqual(fill2.count, 0);
  assert.ok(fill2.reason.includes('idempotency guard'));
  console.log('✓ Atomic idempotency guard prevents duplicate fills and fees when quote events repeat');

  // 7. Targeted Regressions: wrong-symbol, missing-exchange, future-timestamp, quote older than order
  // 7a: Wrong-symbol quote
  const wrongSymbolQuote: ServerQuotePayload = {
    symbol: 'INFY', // Wrong symbol
    exchange: 'NSE',
    price: 2480.0,
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };
  const wrongSymRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder, // expected symbol: RELIANCE
    quote: wrongSymbolQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(wrongSymRes.satisfied, false, 'Wrong-symbol quote must not satisfy');
  assert.ok(wrongSymRes.reason.includes('Symbol mismatch') || wrongSymRes.reason.includes('mismatch'));
  console.log('✓ Targeted regression: Wrong symbol rejected');

  // 7b: Missing-exchange quote
  const missingExchQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    price: 2480.0,
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };
  const missingExchRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: missingExchQuote,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(missingExchRes.satisfied, false, 'Missing exchange quote must not satisfy');
  assert.ok(missingExchRes.reason.includes('missing exchange'));
  console.log('✓ Targeted regression: Missing exchange rejected');

  // 7c: Future-timestamp beyond clock-skew tolerance (> 15s)
  const futureQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2480.0,
    source: 'live_feed',
    as_of: new Date(REGULAR_SESSION_DATE.getTime() + 60_000).toISOString(), // 60s in future
  };
  const futureRes = checkPaperLimitSatisfaction({
    order: buyLimitOrder,
    quote: futureQuote,
    nowUtc: REGULAR_SESSION_DATE,
    maxClockSkewSeconds: 15,
  });
  assert.strictEqual(futureRes.satisfied, false, 'Future timestamp quote must not satisfy');
  assert.ok(futureRes.reason.includes('clock-skew tolerance'));
  console.log('✓ Targeted regression: Future timestamp outside clock-skew tolerance rejected');

  // 7d: Quote older than order creation time
  const quoteBeforeOrder: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2480.0,
    source: 'live_feed',
    as_of: new Date(REGULAR_SESSION_DATE.getTime() - 10_000).toISOString(), // 10s before order
  };
  const orderWithPlacedAt = {
    ...buyLimitOrder,
    placed_at: REGULAR_SESSION_DATE.toISOString(), // Order created at T
  };
  const olderQuoteRes = checkPaperLimitSatisfaction({
    order: orderWithPlacedAt,
    quote: quoteBeforeOrder, // Quote from T - 10s
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(olderQuoteRes.satisfied, false, 'Quote older than order must not satisfy');
  assert.ok(olderQuoteRes.reason.includes('older than order'));
  console.log('✓ Targeted regression: Quote older than order rejected');

  // 8. Test a limit crossing that occurs and reverses before anyone opens the blotter
  // Order placed with limit 2500 (buy).
  // Market dips to 2490 (touch/crossing), then reverses to 2550.
  // When evaluateRestingPaperOrdersWithQuote runs on the dip, order is FILLED.
  const blotterOrderLog = new MockPrismaOrderLog();
  const blotterPrisma = { orderLog: blotterOrderLog };

  const { evaluateRestingPaperOrdersWithQuote } = await import('./orders/execution');
  // At T+10s (market dips to 2490)
  const dipQuote: ServerQuotePayload = {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2490.0,
    source: 'live_feed',
    as_of: new Date(REGULAR_SESSION_DATE.getTime() + 10_000).toISOString(),
  };
  const evalResult = await evaluateRestingPaperOrdersWithQuote(
    blotterPrisma,
    'paper-test-a',
    dipQuote,
    new Date(REGULAR_SESSION_DATE.getTime() + 10_000)
  );
  assert.strictEqual(evalResult.filled, 1, 'Resting limit order must fill during the quote crossing');

  // At T+30s (market reverses to 2550, user finally opens blotter)
  // Blotter GET performs a read-only fetch
  const finalOrder = (blotterOrderLog as any).orders.get('ord-buy-001');
  assert.strictEqual(finalOrder.status, 'FILLED', 'Order must already be FILLED when blotter is opened');
  assert.ok(finalOrder.price <= 2500, 'Fill price must respect buy limit price');
  assert.strictEqual(blotterOrderLog.orders.get('ord-other-user').status, 'OPEN');
  console.log('✓ Limit crossing occurring and reversing before blotter opened is already FILLED');

  console.log('All Paper Limit Order Lifecycle Tests Passed successfully!');
}

runPaperLimitLifecycleTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
