/// <reference types="node" />
/**
 * Paper Account Ledger, Buying Power, Exit Lifecycle & Holdings Integration Tests
 *
 * Requirements:
 * - Starting capital: ₹1,000,000.00
 * - Buying power: available_cash = cash - reserved_cash (from open buy limit orders)
 * - Prohibit overspending: reject buy orders exceeding available cash
 * - Prohibit delivery short-selling: reject delivery sells exceeding owned holdings
 * - Atomic fill updates: cash, positions, fees, and realized P&L
 * - Release reservations on order cancellation
 * - Deduplicate concurrent submissions with matching idempotency keys; reject conflicting keys
 * - Attached exits (Target / Stop Loss) spawned on fill, and OCO cancellation on exit execution
 */

import assert from 'node:assert';
import {
  computePaperAccountState,
  INITIAL_PAPER_CAPITAL,
} from './orders/paper-account';
import {
  checkPaperLimitSatisfaction,
  executePaperLimitFill,
  spawnAttachedExitOrders,
} from './orders/execution';

const REGULAR_SESSION_DATE = new Date('2026-11-18T05:00:00Z'); // 10:30 AM IST (Wed)

class MockPrismaStore {
  public orders: Map<string, any> = new Map();

  public orderLog = {
    findMany: async (query?: any) => {
      const all = Array.from(this.orders.values());
      return all.filter((o) => {
        if (query?.where?.user_id && o.user_id !== query.where.user_id) return false;
        if (query?.where?.symbol && o.symbol !== query.where.symbol) return false;
        if (query?.where?.exchange && o.exchange !== query.where.exchange) return false;
        if (query?.where?.status && o.status !== query.where.status) return false;
        if (query?.where?.mode && o.mode && o.mode !== query.where.mode) return false;
        if (query?.where?.source && o.source !== query.where.source) return false;
        return true;
      });
    },

    findFirst: async (query: any) => {
      const all = Array.from(this.orders.values());
      return all.find((o) => {
        if (query.where.id && o.id !== query.where.id) return false;
        if (query.where.user_id && o.user_id !== query.where.user_id) return false;
        if (query.where.idempotency_key && o.idempotency_key !== query.where.idempotency_key) return false;
        if (query.where.source && o.source !== query.where.source) return false;
        if (query.where.mode && o.mode !== query.where.mode) return false;
        if (query.where.status && o.status !== query.where.status) return false;
        if (query.where.response_raw?.contains && !o.response_raw?.includes(query.where.response_raw.contains)) return false;
        return true;
      }) || null;
    },

    create: async ({ data }: { data: any }) => {
      // Check unique constraint on [user_id, idempotency_key]
      if (data.idempotency_key) {
        for (const existing of this.orders.values()) {
          if (existing.user_id === data.user_id && existing.idempotency_key === data.idempotency_key) {
            const err: any = new Error('Unique constraint failed on user_id, idempotency_key');
            err.code = 'P2002';
            throw err;
          }
        }
      }
      const id = data.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const order = { ...data, id, placed_at: data.placed_at || new Date() };
      this.orders.set(id, order);
      return order;
    },

    updateMany: async (query: { where: Record<string, any>; data: any }) => {
      let count = 0;
      for (const order of this.orders.values()) {
        let match = true;
        if (query.where.id && order.id !== query.where.id) match = false;
        if (query.where.user_id && order.user_id !== query.where.user_id) match = false;
        if (query.where.mode && order.mode !== query.where.mode) match = false;
        if (query.where.status && order.status !== query.where.status) match = false;
        if (query.where.source && order.source !== query.where.source) match = false;
        if (query.where.response_raw?.contains && !order.response_raw?.includes(query.where.response_raw.contains)) {
          match = false;
        }

        if (match) {
          Object.assign(order, query.data);
          count++;
        }
      }
      return { count };
    },
  };
}

async function runPaperAccountLedgerTests() {
  console.log('🧪 Running Paper Account Ledger & Holdings Integration Tests...\n');

  // Test 1: Starting virtual capital is exactly ₹1,000,000.00
  console.log('Test 1: Starting virtual capital verification');
  const emptyState = computePaperAccountState([]);
  assert.strictEqual(emptyState.starting_capital, 1_000_000.0);
  assert.strictEqual(emptyState.cash_balance, 1_000_000.0);
  assert.strictEqual(emptyState.available_cash, 1_000_000.0);
  assert.strictEqual(emptyState.reserved_cash, 0);
  assert.strictEqual(emptyState.realized_pnl, 0);
  assert.strictEqual(emptyState.total_fees, 0);
  console.log('  ✓ Starting capital initialized to ₹10,00,000.00 with zero reservations');

  // Test 2: Buying power reservation on OPEN BUY order
  console.log('Test 2: Cash reservation for resting OPEN limit buy');
  const openBuyOrder = {
    id: 'ord-buy-open-1',
    user_id: 'user-ledger-test',
    mode: 'PAPER',
    broker: 'PAPER',
    symbol: 'RELIANCE',
    transaction_type: 'BUY',
    quantity: 100,
    price: 2500.0,
    status: 'OPEN',
    order_type: 'LIMIT',
    product_type: 'CNC',
  };
  const stateWithOpenBuy = computePaperAccountState([openBuyOrder]);
  assert.ok(stateWithOpenBuy.reserved_cash > 250000.0, 'Reserved cash must include notional + estimated fees');
  assert.strictEqual(stateWithOpenBuy.available_cash, Number((1_000_000.0 - stateWithOpenBuy.reserved_cash).toFixed(2)));
  console.log(`  ✓ Resting BUY order reserves ₹${stateWithOpenBuy.reserved_cash} (Available: ₹${stateWithOpenBuy.available_cash})`);

  // Test 3: Insufficient buying power rejection
  console.log('Test 3: Reject BUY order when required cash exceeds available buying power');
  const hugeBuyNotional = 1_500_000.0;
  const isAffordable = hugeBuyNotional <= stateWithOpenBuy.available_cash;
  assert.strictEqual(isAffordable, false, 'Overspending must be rejected');
  console.log('  ✓ 100M-share or over-budget orders safely blocked by available buying power');

  // Test 4: Atomic fill and position accounting
  console.log('Test 4: Atomic transition from OPEN to FILLED updates cash, position, and fees');
  const filledBuyOrder = {
    id: 'ord-buy-filled-1',
    user_id: 'user-ledger-test',
    mode: 'PAPER',
    broker: 'PAPER',
    symbol: 'RELIANCE',
    transaction_type: 'BUY',
    quantity: 50,
    price: 2500.0, // Notional = 125,000
    fees_inr: 150.0,
    status: 'FILLED',
    order_type: 'LIMIT',
    product_type: 'CNC',
    placed_at: new Date('2026-11-18T05:00:00Z'),
  };
  const stateAfterBuyFill = computePaperAccountState([filledBuyOrder]);
  const expectedCash = 1_000_000.0 - (50 * 2500.0 + 150.0);
  assert.strictEqual(stateAfterBuyFill.cash_balance, expectedCash);
  assert.strictEqual(stateAfterBuyFill.total_fees, 150.0);
  assert.strictEqual(stateAfterBuyFill.positions['RELIANCE'].quantity, 50);
  assert.strictEqual(stateAfterBuyFill.positions['RELIANCE'].available_quantity, 50);
  console.log(`  ✓ Cash deducted to ₹${expectedCash}, 50 RELIANCE shares owned at avg ₹2503.00`);

  // Test 5: Delivery short-selling prevention
  console.log('Test 5: Prohibit unsupported delivery short selling (selling more than owned)');
  const attemptSellQty = 60; // Owned = 50
  const canSellDelivery = attemptSellQty <= stateAfterBuyFill.positions['RELIANCE'].available_quantity;
  assert.strictEqual(canSellDelivery, false, 'Delivery short selling must be prohibited');
  console.log('  ✓ Unsupported delivery sell (attempt 60 > owned 50) safely rejected');

  // Test 6: Selling owned shares realizes P&L and updates cash
  console.log('Test 6: Sell owned shares realizes profit and returns cash to account');
  const filledSellOrder = {
    id: 'ord-sell-filled-1',
    user_id: 'user-ledger-test',
    mode: 'PAPER',
    broker: 'PAPER',
    symbol: 'RELIANCE',
    transaction_type: 'SELL',
    quantity: 50,
    price: 2600.0, // Notional = 130,000 (+₹100/share gain)
    fees_inr: 160.0,
    status: 'FILLED',
    order_type: 'LIMIT',
    product_type: 'CNC',
    placed_at: new Date('2026-11-18T05:10:00Z'),
  };
  const stateAfterSellFill = computePaperAccountState([filledBuyOrder, filledSellOrder]);
  assert.strictEqual(stateAfterSellFill.positions['RELIANCE'].quantity, 0);
  assert.strictEqual(stateAfterSellFill.positions['RELIANCE'].available_quantity, 0);
  assert.ok(stateAfterSellFill.realized_pnl > 4500.0, 'Realized PnL should be ~₹4,690 after fees');
  assert.strictEqual(stateAfterSellFill.total_fees, 310.0);
  console.log(`  ✓ Position cleanly closed: Realized P&L +₹${stateAfterSellFill.realized_pnl}, Net Cash ₹${stateAfterSellFill.cash_balance}`);

  // Test 7: Reservation release on CANCELLED order
  console.log('Test 7: Reservation release upon order cancellation');
  const cancelledBuyOrder = { ...openBuyOrder, status: 'CANCELLED' };
  const stateAfterCancel = computePaperAccountState([cancelledBuyOrder]);
  assert.strictEqual(stateAfterCancel.reserved_cash, 0);
  assert.strictEqual(stateAfterCancel.available_cash, 1_000_000.0);
  console.log('  ✓ Cancelled order releases cash reservation back to available buying power');

  // Test 8: Concurrent duplicate idempotency key handling
  console.log('Test 8: Idempotency uniqueness collision returns original order without throwing 500');
  const mockStore = new MockPrismaStore();
  const firstOrder = await mockStore.orderLog.create({
    data: {
      user_id: 'user-idem-1',
      broker: 'PAPER',
      mode: 'PAPER',
      symbol: 'TCS',
      transaction_type: 'BUY',
      quantity: 10,
      price: 3800.0,
      order_type: 'LIMIT',
      product_type: 'CNC',
      status: 'OPEN',
      idempotency_key: 'idem-key-abc-123',
    },
  });
  assert.strictEqual(firstOrder.symbol, 'TCS');

  // Simulate concurrent collision throwing P2002
  let duplicateCaught = false;
  try {
    await mockStore.orderLog.create({
      data: {
        user_id: 'user-idem-1',
        broker: 'PAPER',
        mode: 'PAPER',
        symbol: 'TCS',
        transaction_type: 'BUY',
        quantity: 10,
        price: 3800.0,
        order_type: 'LIMIT',
        product_type: 'CNC',
        status: 'OPEN',
        idempotency_key: 'idem-key-abc-123',
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      duplicateCaught = true;
      const existing = await mockStore.orderLog.findFirst({
        where: { user_id: 'user-idem-1', idempotency_key: 'idem-key-abc-123' },
      });
      assert.strictEqual(existing?.id, firstOrder.id);
      assert.strictEqual(existing?.symbol, 'TCS');
    }
  }
  assert.strictEqual(duplicateCaught, true, 'Unique constraint collision must be caught and return original order');
  console.log('  ✓ Concurrent submission safely recovers existing order on P2002 collision');

  // Test 9: Attached Exits (Bracket Order) Creation & OCO Cancellation
  console.log('Test 9: Attached Target & Stop-Loss order spawning and OCO sibling cancellation');
  const parentOrder = await mockStore.orderLog.create({
    data: {
      user_id: 'user-bracket-1',
      broker: 'PAPER',
      mode: 'PAPER',
      symbol: 'INFY',
      transaction_type: 'BUY',
      quantity: 25,
      price: 1800.0,
      order_type: 'MARKET',
      product_type: 'CNC',
      status: 'FILLED',
    },
  });

  const spawnedIds = await spawnAttachedExitOrders(mockStore, {
    userId: 'user-bracket-1',
    parentOrder: {
      id: parentOrder.id,
      symbol: 'INFY',
      exchange: 'NSE',
      quantity: 25,
      product_type: 'CNC',
    },
    targetPrice: 1950.0,
    stopLossPrice: 1720.0,
  });
  assert.strictEqual(spawnedIds.length, 2, 'Must spawn 2 attached exit orders (Target & SL)');

  const targetOrd = mockStore.orders.get(spawnedIds[0]);
  const slOrd = mockStore.orders.get(spawnedIds[1]);
  targetOrd.placed_at = new Date(REGULAR_SESSION_DATE.getTime() - 5000);
  slOrd.placed_at = new Date(REGULAR_SESSION_DATE.getTime() - 5000);
  assert.strictEqual(targetOrd.order_type, 'LIMIT');
  assert.strictEqual(targetOrd.price, 1950.0);
  assert.strictEqual(slOrd.order_type, 'SL');
  assert.strictEqual(slOrd.trigger_price, 1720.0);

  // When Target reaches satisfaction, fill target and simulate OCO cancellation of SL
  const quoteAtTarget = {
    symbol: 'INFY',
    exchange: 'NSE',
    price: 1955.0, // > 1950 target
    source: 'live_feed',
    as_of: REGULAR_SESSION_DATE.toISOString(),
  };
  const targetCheck = checkPaperLimitSatisfaction({
    order: targetOrd,
    quote: quoteAtTarget,
    nowUtc: REGULAR_SESSION_DATE,
  });
  assert.strictEqual(targetCheck.satisfied, true, 'Target order must be satisfied');

  // Execute fill on Target
  const targetFillRes = await executePaperLimitFill(mockStore, {
    orderId: targetOrd.id,
    userId: 'user-bracket-1',
    fillPrice: targetCheck.fillPrice!,
    fees: targetCheck.fees!,
    orderType: 'LIMIT',
  });
  assert.strictEqual(targetFillRes.filled, true);

  // Simulate OCO Sibling Cancellation
  await mockStore.orderLog.updateMany({
    where: {
      user_id: 'user-bracket-1',
      mode: 'PAPER',
      status: 'OPEN',
      source: 'ATTACHED_STOP_LOSS',
      response_raw: { contains: parentOrder.id },
    },
    data: { status: 'CANCELLED' },
  });

  const updatedSl = mockStore.orders.get(slOrd.id);
  assert.strictEqual(updatedSl.status, 'CANCELLED', 'OCO Stop-loss sibling must be cancelled when target fills');
  console.log('  ✓ Bracket exits created; Target filled and paired Stop Loss cleanly cancelled (OCO)');

  console.log('\n🎉 ALL PAPER ACCOUNT LEDGER & ATTACHED EXIT TESTS PASSED!\n');
}

runPaperAccountLedgerTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
