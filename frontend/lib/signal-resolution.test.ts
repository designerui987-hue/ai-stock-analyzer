import assert from 'node:assert';
import { evaluateSignal } from './signal-resolution.ts';

console.log('Running Signal Resolution Tests...');

const baseSignal = {
  signal_type: 'BUY',
  entry_price: 100,
  target_price: 120,
  stop_loss_price: 90,
  issued_at: new Date('2024-01-01T00:00:00Z'),
  horizon_days: 10
};

// Test 1: BUY Target Hit
{
  const res = evaluateSignal(baseSignal, 125, new Date('2024-01-05T00:00:00Z'));
  assert.strictEqual(res.status, 'TARGET_HIT');
  assert.strictEqual(res.closed_price, 125);
  assert.strictEqual(res.realized_pnl_pct, 25);
}

// Test 2: BUY Stop Loss Hit
{
  const res = evaluateSignal(baseSignal, 85, new Date('2024-01-05T00:00:00Z'));
  assert.strictEqual(res.status, 'SL_HIT');
  assert.strictEqual(res.closed_price, 85);
  assert.strictEqual(res.realized_pnl_pct, -15);
}

// Test 3: SELL Target Hit
{
  const sellSignal = { ...baseSignal, signal_type: 'SELL', target_price: 80, stop_loss_price: 110 };
  const res = evaluateSignal(sellSignal, 75, new Date('2024-01-05T00:00:00Z'));
  assert.strictEqual(res.status, 'TARGET_HIT');
  assert.strictEqual(res.closed_price, 75);
  assert.strictEqual(res.realized_pnl_pct, 25); // (100 - 75)/100
}

// Test 4: SELL Stop Loss Hit
{
  const sellSignal = { ...baseSignal, signal_type: 'SELL', target_price: 80, stop_loss_price: 110 };
  const res = evaluateSignal(sellSignal, 115, new Date('2024-01-05T00:00:00Z'));
  assert.strictEqual(res.status, 'SL_HIT');
  assert.strictEqual(res.closed_price, 115);
  assert.strictEqual(res.realized_pnl_pct, -15); // (100 - 115)/100
}

// Test 5: Still Open
{
  const res = evaluateSignal(baseSignal, 105, new Date('2024-01-05T00:00:00Z'));
  assert.strictEqual(res.status, 'OPEN');
  assert.strictEqual(res.closed_price, null);
}

// Test 6: Expired
{
  const res = evaluateSignal(baseSignal, 105, new Date('2024-01-12T00:00:00Z'));
  assert.strictEqual(res.status, 'EXPIRED');
  assert.strictEqual(res.closed_price, 105);
  assert.strictEqual(res.realized_pnl_pct, 5); // (105-100)/100
}

console.log('✅ All signal resolution tests passed!');
