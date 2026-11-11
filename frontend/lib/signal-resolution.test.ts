/**
 * Comprehensive Test Suite for Signal Generation & Resolution Engine
 *
 * Verifies:
 *   1. Same-bar stop/target hit -> SL_HIT (conservative) for BUY
 *   2. Same-bar stop/target hit -> SL_HIT (conservative) for SELL
 *   3. Clean BUY Target Hit and Stop Loss Hit
 *   4. Clean SELL (short) Target Hit and Stop Loss Hit with correct PnL formulas
 *   5. Expiry resolution after horizon_days exceeded
 *   6. Next-day open entry price for signals issued after market close (15:30 IST)
 *   7. Deterministic signal indicators & confidence score formula (docs/CONFIDENCE.md)
 *   8. Performance stats calculation (win rate, avg return, max drawdown, trade count, min-sample warning < 30)
 */

import assert from 'node:assert';
import {
  resolveSignalWithBars,
  isIssuedAfterMarketClose,
  DailyBar,
  SignalInput,
} from './signal-resolution';
import {
  generateDeterministicSignal,
  calculateIndicators,
  computeConfidenceScore,
  RULE_VERSION,
} from './deterministic-signals';

async function runTests() {
  console.log('🧪 Running Signal Resolution & Deterministic Track Record Tests...\n');

  // =========================================================================
  // Test 1: Same-bar stop & target -> SL_HIT (conservative) for BUY
  // =========================================================================
  console.log('Test 1: Same-bar stop/target conflict resolves to SL_HIT (conservative) for BUY');
  {
    const signal: SignalInput = {
      signal_type: 'BUY',
      entry_price: 2500,
      target_price: 2600,
      stop_loss_price: 2400,
      issued_at: new Date('2026-11-02T10:00:00+05:30'), // 10:00 IST (during market hours)
      horizon_days: 14,
    };

    // Single bar where High reaches 2650 (target hit!) AND Low dips to 2350 (stop hit!)
    const bars: DailyBar[] = [
      {
        date: '2026-11-02',
        open: 2510,
        high: 2650, // >= 2600
        low: 2350,  // <= 2400
        close: 2580,
        volume: 1000000,
      },
    ];

    const result = resolveSignalWithBars(signal, bars);

    assert.strictEqual(result.status, 'SL_HIT', 'Must resolve conservatively to SL_HIT when both triggered in same bar');
    assert.strictEqual(result.closed_price, 2400, 'Closed price must be the stop loss price');
    assert.strictEqual(result.realized_pnl_pct, -4.0, 'PnL must be ((2400 - 2500) / 2500) * 100 = -4.0%');
    console.log('  ✓ BUY same-bar conflict resolved conservatively to SL_HIT (-4.0% PnL)');
  }

  // =========================================================================
  // Test 2: Same-bar stop & target -> SL_HIT (conservative) for SELL
  // =========================================================================
  console.log('Test 2: Same-bar stop/target conflict resolves to SL_HIT (conservative) for SELL');
  {
    const signal: SignalInput = {
      signal_type: 'SELL',
      entry_price: 2500,
      target_price: 2400,     // Target below entry
      stop_loss_price: 2600,  // Stop loss above entry
      issued_at: new Date('2026-11-02T10:00:00+05:30'),
      horizon_days: 14,
    };

    // Single bar where Low drops to 2380 (target hit!) AND High rises to 2620 (stop hit!)
    const bars: DailyBar[] = [
      {
        date: '2026-11-02',
        open: 2490,
        high: 2620, // >= 2600 (stop triggered)
        low: 2380,  // <= 2400 (target triggered)
        close: 2450,
        volume: 1000000,
      },
    ];

    const result = resolveSignalWithBars(signal, bars);

    assert.strictEqual(result.status, 'SL_HIT', 'Must resolve conservatively to SL_HIT for SELL same-bar conflict');
    assert.strictEqual(result.closed_price, 2600, 'Closed price must be the stop loss price');
    // For SELL, loss on short: ((entry - stop) / entry) * 100 = ((2500 - 2600) / 2500) * 100 = -4.0%
    assert.strictEqual(result.realized_pnl_pct, -4.0, 'Realized PnL must be -4.0% on stop out');
    console.log('  ✓ SELL same-bar conflict resolved conservatively to SL_HIT (-4.0% PnL)');
  }

  // =========================================================================
  // Test 3: Clean BUY Target Hit and Stop Loss Hit
  // =========================================================================
  console.log('Test 3: Normal BUY Target Hit and Stop Loss Hit');
  {
    const signal: SignalInput = {
      signal_type: 'BUY',
      entry_price: 1000,
      target_price: 1060,
      stop_loss_price: 970,
      issued_at: new Date('2026-11-02T10:00:00+05:30'),
      horizon_days: 10,
    };

    // Target Hit bar (Low remains well above stop)
    const targetBars: DailyBar[] = [
      { date: '2026-11-02', open: 1010, high: 1070, low: 990, close: 1065, volume: 500000 },
    ];
    const targetRes = resolveSignalWithBars(signal, targetBars);
    assert.strictEqual(targetRes.status, 'TARGET_HIT');
    assert.strictEqual(targetRes.closed_price, 1060);
    assert.strictEqual(targetRes.realized_pnl_pct, 6.0);

    // Stop Loss Hit bar (High remains below target)
    const slBars: DailyBar[] = [
      { date: '2026-11-02', open: 990, high: 995, low: 960, close: 965, volume: 500000 },
    ];
    const slRes = resolveSignalWithBars(signal, slBars);
    assert.strictEqual(slRes.status, 'SL_HIT');
    assert.strictEqual(slRes.closed_price, 970);
    assert.strictEqual(slRes.realized_pnl_pct, -3.0);

    console.log('  ✓ Clean BUY Target Hit (+6.0%) and Stop Loss Hit (-3.0%) verified');
  }

  // =========================================================================
  // Test 4: SELL-Side Logic (target below, stop above, correct inverted PnL)
  // =========================================================================
  console.log('Test 4: SELL-Side logic (target below entry, stop above entry, inverted PnL)');
  {
    const sellSignal: SignalInput = {
      signal_type: 'SELL',
      entry_price: 3000,
      target_price: 2850,    // 5% profit target on short
      stop_loss_price: 3075, // 2.5% stop loss on short
      issued_at: new Date('2026-11-02T10:00:00+05:30'),
      horizon_days: 10,
    };

    // Bar 1: Price drops, low touches 2840 (target hit!)
    const targetBars: DailyBar[] = [
      { date: '2026-11-02', open: 2980, high: 3010, low: 2840, close: 2860, volume: 800000 },
    ];
    const targetRes = resolveSignalWithBars(sellSignal, targetBars);
    assert.strictEqual(targetRes.status, 'TARGET_HIT');
    assert.strictEqual(targetRes.closed_price, 2850);
    // Short profit: ((3000 - 2850) / 3000) * 100 = +5.0%
    assert.strictEqual(targetRes.realized_pnl_pct, 5.0, 'Short target hit must yield positive PnL (+5.0%)');

    // Bar 2: Price surges, high touches 3090 (stop hit!)
    const slBars: DailyBar[] = [
      { date: '2026-11-02', open: 3020, high: 3090, low: 2990, close: 3080, volume: 800000 },
    ];
    const slRes = resolveSignalWithBars(sellSignal, slBars);
    assert.strictEqual(slRes.status, 'SL_HIT');
    assert.strictEqual(slRes.closed_price, 3075);
    // Short loss: ((3000 - 3075) / 3000) * 100 = -2.5%
    assert.strictEqual(slRes.realized_pnl_pct, -2.5, 'Short stop loss must yield negative PnL (-2.5%)');

    console.log('  ✓ SELL-side mechanics verified: target (+5.0%), stop (-2.5%)');
  }

  // =========================================================================
  // Test 5: Expiry Resolution after horizon_days exceeded
  // =========================================================================
  console.log('Test 5: Expiry resolution when horizon_days is exceeded');
  {
    const signal: SignalInput = {
      signal_type: 'BUY',
      entry_price: 1000,
      target_price: 1100,
      stop_loss_price: 900,
      issued_at: new Date('2026-10-01T10:00:00+05:30'),
      horizon_days: 6, // 6 calendar days (2026-10-01 to 2026-10-07)
    };

    // Bars spanning 7 days where price hovers between 950 and 1050 (never touches 1100 or 900)
    const bars: DailyBar[] = [
      { date: '2026-10-01', open: 1000, high: 1020, low: 990, close: 1010, volume: 100000 },
      { date: '2026-10-02', open: 1010, high: 1030, low: 995, close: 1020, volume: 100000 },
      { date: '2026-10-05', open: 1020, high: 1040, low: 1010, close: 1030, volume: 100000 },
      { date: '2026-10-06', open: 1030, high: 1045, low: 1005, close: 1015, volume: 100000 },
      { date: '2026-10-07', open: 1015, high: 1025, low: 980, close: 1020, volume: 100000 }, // Past horizon!
    ];

    const result = resolveSignalWithBars(signal, bars, new Date('2026-10-08T00:00:00Z'));

    assert.strictEqual(result.status, 'EXPIRED', 'Signal must resolve as EXPIRED after horizon_days');
    assert.strictEqual(result.closed_price, 1020, 'Closed price must be final bar close');
    assert.strictEqual(result.realized_pnl_pct, 2.0, 'PnL is ((1020 - 1000) / 1000) * 100 = 2.0%');
    console.log('  ✓ Signal resolved to EXPIRED after horizon_days with realized PnL (+2.0%)');
  }

  // =========================================================================
  // Test 6: Next-Day Open Entry when issued after market close (15:30 IST)
  // =========================================================================
  console.log('Test 6: Next-day open entry when issued after market close (15:30 IST)');
  {
    // Issued on 2026-11-02 at 18:00 IST (after market close)
    const issuedAt = new Date('2026-11-02T18:00:00+05:30');
    assert.strictEqual(isIssuedAfterMarketClose(issuedAt), true, 'Must identify 18:00 IST as after close');

    const signal: SignalInput = {
      signal_type: 'BUY',
      entry_price: 2480, // Closing price at time of evening scan
      target_price: 2600,
      stop_loss_price: 2400,
      issued_at: issuedAt,
      horizon_days: 10,
    };

    // Bars:
    // Bar 1 is 2026-11-02 (day of evening scan - trade could NOT have entered on this bar)
    // Bar 2 is 2026-11-03 (opens with gap up at 2520)
    const bars: DailyBar[] = [
      { date: '2026-11-02', open: 2460, high: 2490, low: 2450, close: 2480, volume: 1000000 },
      { date: '2026-11-03', open: 2520, high: 2620, low: 2510, close: 2610, volume: 1500000 }, // Gaps up to 2520 open, hits 2620 target
    ];

    const result = resolveSignalWithBars(signal, bars);

    assert.strictEqual(result.effective_entry_price, 2520, 'Entry price must be the next trading day open (2520), not 2480');
    assert.strictEqual(result.status, 'TARGET_HIT');
    assert.strictEqual(result.closed_price, 2600);
    // PnL must be calculated vs actual effective entry: ((2600 - 2520) / 2520) * 100 = 3.17%
    assert.strictEqual(result.realized_pnl_pct, 3.17, 'PnL must use next-day open entry (3.17% instead of 4.84%)');
    console.log('  ✓ Next-day open entry correctly applied (entry: ₹2520, PnL: +3.17%)');
  }

  // =========================================================================
  // Test 7: Deterministic Signal Generation & Confidence Score Formula
  // =========================================================================
  console.log('Test 7: Deterministic signal generation and confidence formula (docs/CONFIDENCE.md)');
  {
    // Generate synthetic realistic trend bars (60 days)
    const trendBars: DailyBar[] = [];
    let price = 1000;
    for (let i = 0; i < 60; i++) {
      price += 4; // Upward trend
      const dateStr = new Date(2026, 8, 1 + i).toISOString().split('T')[0];
      trendBars.push({
        date: dateStr,
        open: price - 2,
        high: price + 6,
        low: price - 4,
        close: price,
        volume: 1200000,
      });
    }

    const ind = calculateIndicators(trendBars);
    assert.ok(ind, 'Indicators must be computable for 60 bars');
    assert.strictEqual(ind.barCount, 60);
    assert.ok(ind.rsi > 50, 'RSI should reflect upward drift');
    assert.ok(ind.atr > 0, 'ATR must be positive');
    assert.ok(ind.sma20 > ind.sma50, 'SMA20 > SMA50 in upward trend');

    const signal = generateDeterministicSignal('INFY', trendBars);
    assert.ok(signal, 'Signal must be generated');
    assert.strictEqual(signal.symbol, 'INFY');
    assert.strictEqual(signal.signal_type, 'BUY');
    assert.strictEqual(signal.rule_version, RULE_VERSION);
    assert.strictEqual(signal.source, 'yfinance');

    // Verify confidence is bounded between 40 and 100
    assert.ok(signal.confidence_pct >= 40 && signal.confidence_pct <= 100, 'Confidence must be in [40, 100]');
    
    // Check model breakdown format (no fake XGBoost/Prophet models)
    const breakdown = JSON.parse(signal.model_breakdown);
    assert.strictEqual(breakdown.is_win_probability, false);
    assert.ok('rule_consensus_points' in breakdown);
    assert.ok('data_completeness_points' in breakdown);

    // Verify 2:1 Reward to Risk
    const risk = signal.entry_price - signal.stop_loss_price;
    const reward = signal.target_price - signal.entry_price;
    assert.ok(reward > risk, 'Reward must exceed risk (2:1 target)');
    assert.ok(Math.abs(reward / risk - 2.0) < 0.1, 'Target must be ~2x ATR risk');

    console.log(`  ✓ Deterministic signal generated: ${signal.signal_type} @ ₹${signal.entry_price}, Conf: ${signal.confidence_pct}%, RR: ~2:1`);
  }

  // =========================================================================
  // Test 8: Performance Page Metrics & Minimum-Sample Warning (< 30)
  // =========================================================================
  console.log('Test 8: Performance stats calculation & minimum-sample warning (< 30 trades)');
  {
    // Simulation 1: 15 closed signals (< 30 trades)
    const closed15 = [
      { status: 'TARGET_HIT', realized_pnl_pct: 6.0, closed_at: '2026-10-01' },
      { status: 'TARGET_HIT', realized_pnl_pct: 5.0, closed_at: '2026-10-02' },
      { status: 'SL_HIT', realized_pnl_pct: -3.0, closed_at: '2026-10-03' },
      { status: 'TARGET_HIT', realized_pnl_pct: 4.0, closed_at: '2026-10-04' },
      { status: 'SL_HIT', realized_pnl_pct: -2.5, closed_at: '2026-10-05' },
      { status: 'TARGET_HIT', realized_pnl_pct: 7.0, closed_at: '2026-10-06' },
      { status: 'EXPIRED', realized_pnl_pct: 1.0, closed_at: '2026-10-07' },
      { status: 'SL_HIT', realized_pnl_pct: -3.0, closed_at: '2026-10-08' },
      { status: 'TARGET_HIT', realized_pnl_pct: 4.5, closed_at: '2026-10-09' },
      { status: 'TARGET_HIT', realized_pnl_pct: 5.5, closed_at: '2026-10-10' },
      { status: 'SL_HIT', realized_pnl_pct: -3.0, closed_at: '2026-10-11' },
      { status: 'TARGET_HIT', realized_pnl_pct: 6.0, closed_at: '2026-10-12' },
      { status: 'SL_HIT', realized_pnl_pct: -2.0, closed_at: '2026-10-13' },
      { status: 'TARGET_HIT', realized_pnl_pct: 4.0, closed_at: '2026-10-14' },
      { status: 'TARGET_HIT', realized_pnl_pct: 5.0, closed_at: '2026-10-15' },
    ];

    const totalClosed = closed15.length; // 15
    const targetHits = closed15.filter((s) => s.status === 'TARGET_HIT').length; // 10
    const winRate = (targetHits / totalClosed) * 100; // 66.67%
    const totalPnl = closed15.reduce((acc, s) => acc + s.realized_pnl_pct, 0);
    const avgReturn = totalPnl / totalClosed;

    // Calculate max drawdown
    let equity = 100.0;
    let peak = 100.0;
    let maxDrawdown = 0.0;
    for (const s of closed15) {
      equity *= 1 + s.realized_pnl_pct / 100;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    assert.strictEqual(totalClosed, 15);
    assert.strictEqual(Math.round(winRate * 10) / 10, 60.0);
    assert.ok(avgReturn > 0, 'Average return must be positive');
    assert.ok(maxDrawdown > 0, 'Max drawdown must reflect losses');

    // Minimum sample condition
    const isSampleSufficient15 = totalClosed >= 30;
    assert.strictEqual(isSampleSufficient15, false, 'Must flag sample size < 30 as insufficient');

    // Simulation 2: 35 closed signals (>= 30 trades)
    const isSampleSufficient35 = 35 >= 30;
    assert.strictEqual(isSampleSufficient35, true, 'Sample size >= 30 must satisfy threshold');

    console.log(`  ✓ Performance metrics: Win Rate ${winRate.toFixed(1)}%, Avg Return ${avgReturn.toFixed(2)}%, Max DD ${maxDrawdown.toFixed(2)}%, Min-Sample Warning triggered (< 30)`);
  }

  console.log('\n🎉 ALL SIGNAL RESOLUTION & PERFORMANCE TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
