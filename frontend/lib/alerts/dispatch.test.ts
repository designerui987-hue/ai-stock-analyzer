import assert from 'node:assert';
import {
  shouldSendAlert,
  isQuietHoursActive,
  isRateLimited,
  formatAlertText,
} from './dispatch.ts';
import type { AlertType, AlertPayload } from './dispatch.ts';

console.log('Running Multi-Channel Alert Dispatcher Tests...');

// Mock User Preference
const mockPref = {
  channels_enabled: JSON.stringify({ web_push: true, telegram: true, whatsapp: false }),
  alert_types_subscribed: JSON.stringify({
    new_signal: true,
    target_hit: true,
    sl_hit: true,
    breakout: true,
    risk_warning: true,
    watchlist_move: false,
  }),
  quiet_hours: JSON.stringify({ enabled: true, start: '22:00', end: '07:00' }),
  min_confidence_threshold: 70,
};

// Test 1: Minimum Confidence Threshold Filtering (Strict, No Exceptions)
{
  // 65% confidence signal (below 70% threshold) -> BLOCK
  const res = shouldSendAlert(mockPref, 'new_signal', 65, 'web_push');
  assert.strictEqual(res.send, false);
  assert.ok(res.reason?.includes('below threshold'));

  // 75% confidence signal -> ALLOW
  const allowRes = shouldSendAlert(mockPref, 'new_signal', 75, 'web_push', new Date('2026-07-27T12:00:00Z'));
  assert.strictEqual(allowRes.send, true);
  console.log('  ✓ Minimum confidence threshold filtering test passed');
}

// Test 2: Quiet Hours Check Logic
{
  const nightTime = new Date('2026-07-27T23:30:00Z'); // 23:30 is in 22:00 - 07:00
  const dayTime = new Date('2026-07-27T14:00:00Z'); // 14:00 is outside

  assert.strictEqual(isQuietHoursActive(mockPref.quiet_hours, nightTime), true);
  assert.strictEqual(isQuietHoursActive(mockPref.quiet_hours, dayTime), false);
  console.log('  ✓ Quiet hours time range calculation test passed');
}

// Test 3: Quiet Hours Filtering & Urgent Overrides (SL_HIT / RISK_WARNING)
{
  const nightTime = new Date('2026-07-27T23:30:00Z');

  // Normal signal during quiet hours -> BLOCKED
  const normalRes = shouldSendAlert(mockPref, 'new_signal', 85, 'web_push', nightTime);
  assert.strictEqual(normalRes.send, false);
  assert.ok(normalRes.reason?.includes('quiet hours'));

  // Urgent Stop-Loss Hit during quiet hours -> OVERRIDES & ALLOWS
  const slRes = shouldSendAlert(mockPref, 'sl_hit', 85, 'web_push', nightTime);
  assert.strictEqual(slRes.send, true, 'SL_HIT overrides quiet hours');

  // Urgent Risk Warning during quiet hours -> OVERRIDES & ALLOWS
  const riskRes = shouldSendAlert(mockPref, 'risk_warning', 85, 'web_push', nightTime);
  assert.strictEqual(riskRes.send, true, 'risk_warning overrides quiet hours');

  console.log('  ✓ Capital protection quiet hours override test passed');
}

// Test 4: Rate Limiting
{
  const userId = 'test_user_rate_limit';
  const nowMs = 1700000000000;

  // Send 20 alerts
  for (let i = 0; i < 20; i++) {
    const limited = isRateLimited(userId, 20, nowMs);
    assert.strictEqual(limited, false);
  }

  // 21st alert should be rate limited
  const exceedsLimit = isRateLimited(userId, 20, nowMs);
  assert.strictEqual(exceedsLimit, true);

  console.log('  ✓ Hourly rate limiting test passed');
}

// Test 5: Message Formatting
{
  const payload: AlertPayload = {
    symbol: 'TATAMOTORS',
    signal_type: 'BUY',
    price: 892.15,
    target_price: 950.0,
    stop_loss_price: 860.0,
    confidence_pct: 87,
    rationale: 'JLR volume surge + EV breakout',
  };

  const text = formatAlertText('new_signal', payload);
  assert.ok(text.includes('🟢 BUY TATAMOTORS'));
  assert.ok(text.includes('Target ₹950.00'));
  assert.ok(text.includes('/stocks/TATAMOTORS'));

  console.log('  ✓ Message text formatting test passed');
}

console.log('✅ All Multi-Channel Alert Dispatcher Tests Passed Successfully!');
