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
    private orders = new Map<string, { id: string; status: string; fees_inr: number; price: number }>();

    constructor() {
      this.orders.set('ord-buy-001', { id: 'ord-buy-001', status: 'OPEN', fees_inr: 0, price: 2500 });
    }

    async updateMany(query: { where: { id: string; status: string }; data: any }) {
      const order = this.orders.get(query.where.id);
      if (!order || order.status !== query.where.status) {
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
    fillPrice: 2491.25,
    fees: 14.95,
    sessionName: 'REGULAR',
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(fill2.filled, false, 'Duplicate fill attempt must be ignored');
  assert.strictEqual(fill2.count, 0);
  assert.ok(fill2.reason.includes('idempotency guard'));
  console.log('✓ Atomic idempotency guard prevents duplicate fills and fees when quote events repeat');

  console.log('All Paper Limit Order Lifecycle Tests Passed successfully!');
}

runPaperLimitLifecycleTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
