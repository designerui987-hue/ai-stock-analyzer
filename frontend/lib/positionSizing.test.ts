import assert from 'node:assert';
import {
  calculatePositionSize,
  calculatePortfolioHeat,
  calculateSectorConcentration,
  checkSectorCorrelation,
} from './positionSizing.ts';
import type { HoldingPosition } from './positionSizing.ts';

console.log('Running Position Sizing & Risk Calculation Tests...');

// Test 1: Standard Position Size Calculation
{
  // Capital: ₹10,00,000, Risk %: 1.0% => Max Risk ₹10,000
  // Entry: ₹1,000, SL: ₹950 (Risk per share = ₹50), Target: ₹1,100 (Reward per share = ₹100)
  // Shares = floor(10,000 / 50) = 200 shares
  // Position Value = 200 * 1000 = ₹2,00,000 (20% of capital)
  // R:R = 100 / 50 = 2.0 (EXCELLENT)
  const res = calculatePositionSize({
    account_capital: 1000000,
    risk_pct: 1.0,
    entry_price: 1000,
    stop_loss_price: 950,
    target_price: 1100,
    max_concentration_pct: 20,
    symbol: 'RELIANCE',
  });

  assert.strictEqual(res.error, undefined);
  assert.strictEqual(res.max_risk_amount, 10000);
  assert.strictEqual(res.risk_per_share, 50);
  assert.strictEqual(res.position_size_shares, 200);
  assert.strictEqual(res.position_value, 200000);
  assert.strictEqual(res.risk_reward_ratio, 2.0);
  assert.strictEqual(res.rr_quality, 'EXCELLENT');
  assert.strictEqual(res.position_value_pct, 20.0);
  assert.strictEqual(res.is_concentration_breached, false);
  console.log('  ✓ Standard position sizing formula test passed');
}

// Test 2: Edge Case — Stop Loss equals Entry Price (Zero Risk Denominator)
{
  const res = calculatePositionSize({
    account_capital: 1000000,
    risk_pct: 1.0,
    entry_price: 1000,
    stop_loss_price: 1000,
    target_price: 1100,
  });

  assert.ok(res.error !== undefined, 'Returns error when SL == Entry');
  assert.strictEqual(res.position_size_shares, 0);
  console.log('  ✓ Zero risk denominator error protection test passed');
}

// Test 3: Edge Case — Zero / Negative Capital
{
  const res = calculatePositionSize({
    account_capital: 0,
    risk_pct: 1.0,
    entry_price: 1000,
    stop_loss_price: 950,
    target_price: 1100,
  });

  assert.ok(res.error !== undefined);
  assert.strictEqual(res.position_size_shares, 0);
  console.log('  ✓ Zero capital safety test passed');
}

// Test 4: Risk:Reward Quality Classification
{
  // Poor R:R (< 1.5)
  const poorRes = calculatePositionSize({
    account_capital: 1000000,
    risk_pct: 1.0,
    entry_price: 1000,
    stop_loss_price: 900, // Risk 100
    target_price: 1120, // Reward 120 -> RR = 1.2
  });
  assert.strictEqual(poorRes.risk_reward_ratio, 1.2);
  assert.strictEqual(poorRes.rr_quality, 'POOR');

  // Good R:R (1.5 to 1.99)
  const goodRes = calculatePositionSize({
    account_capital: 1000000,
    risk_pct: 1.0,
    entry_price: 1000,
    stop_loss_price: 900, // Risk 100
    target_price: 1170, // Reward 170 -> RR = 1.7
  });
  assert.strictEqual(goodRes.risk_reward_ratio, 1.7);
  assert.strictEqual(goodRes.rr_quality, 'GOOD');

  console.log('  ✓ Risk:Reward quality classification test passed');
}

// Test 5: Portfolio Heat & Sector Concentration
{
  const holdings: HoldingPosition[] = [
    { symbol: 'TCS', name: 'TCS', qty: 100, avg_price: 3500, current_price: 3800, stop_loss: 3600, sector: 'IT' }, // Risk 200 * 100 = 20,000
    { symbol: 'INFY', name: 'Infosys', qty: 200, avg_price: 1400, current_price: 1500, stop_loss: 1420, sector: 'IT' }, // Risk 80 * 200 = 16,000
    { symbol: 'HDFCBANK', name: 'HDFC Bank', qty: 100, avg_price: 1600, current_price: 1650, stop_loss: 1550, sector: 'Banking' }, // Risk 100 * 100 = 10,000
  ];
  const cap = 500000; // ₹5,00,000

  // Total Risk = 20,000 + 16,000 + 10,000 = 46,000
  // Total Heat % = 46,000 / 500,000 = 9.2% (> 6.0% warning)
  const heat = calculatePortfolioHeat(holdings, cap);
  assert.strictEqual(heat.total_risk_amount, 46000);
  assert.strictEqual(heat.total_heat_pct, 9.2);
  assert.strictEqual(heat.is_heat_warning, true);

  // Sector Correlation
  const corr = checkSectorCorrelation(holdings);
  assert.strictEqual(corr.length, 1);
  assert.ok(corr[0].includes('Concentrated Sector Bet'));

  console.log('  ✓ Portfolio heat & sector concentration test passed');
}

console.log('✅ All Position Sizing & Risk Calculation Tests Passed Successfully!');
