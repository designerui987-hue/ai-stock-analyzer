import assert from 'node:assert';
import { encryptToken, decryptToken } from '../security/crypto.ts';
import { kiteAdapter } from './kite.ts';
import { isOrderRateLimited } from './rateLimiter.ts';

console.log('Running Zerodha Kite Connect Broker Integration Tests...');

// Test 1: Token Encryption & Decryption
{
  const rawToken = 'sess_kite_998877665544332211';
  const encrypted = encryptToken(rawToken);
  assert.notStrictEqual(encrypted, rawToken);
  assert.ok(encrypted.includes(':'));

  const decrypted = decryptToken(encrypted);
  assert.strictEqual(decrypted, rawToken);

  console.log('  ✓ AES-256-GCM token encryption & decryption test passed');
}

// Test 2: Order Placement Rate Limiting (1 order / symbol / 60s)
{
  const userId = 'test_user_rate_limit';
  const symbol = 'RELIANCE';
  const nowMs = 1700000000000;

  // First order -> ALLOW
  const firstCall = isOrderRateLimited(userId, symbol, nowMs);
  assert.strictEqual(firstCall, false);

  // Immediate second order for same symbol -> RATE LIMITED
  const secondCall = isOrderRateLimited(userId, symbol, nowMs + 5000);
  assert.strictEqual(secondCall, true);

  // Order after 61 seconds -> ALLOW
  const laterCall = isOrderRateLimited(userId, symbol, nowMs + 65000);
  assert.strictEqual(laterCall, false);

  console.log('  ✓ Order rate limiting (max 1 order/symbol/60s) test passed');
}

// Test 3: Kite Adapter Mock Order Execution
{
  const mockToken = 'mock_access_token_123';
  const result = await kiteAdapter.placeOrder(mockToken, {
    symbol: 'TATAMOTORS',
    transaction_type: 'BUY',
    quantity: 250,
    order_type: 'MARKET',
    product_type: 'CNC',
    price: 892.5,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'COMPLETE');
  assert.ok(result.broker_order_id);

  console.log('  ✓ Kite Connect adapter order execution test passed');
}

// Test 4: Broker Margin Balance Retrieval
{
  const mockToken = 'mock_access_token_123';
  const margin = await kiteAdapter.getFunds(mockToken);
  assert.ok(margin.available_cash > 0);
  assert.ok(margin.total_collateral >= margin.available_cash);

  console.log('  ✓ Broker margin balance retrieval test passed');
}

console.log('✅ All Zerodha Kite Connect Integration Tests Passed Successfully!');
