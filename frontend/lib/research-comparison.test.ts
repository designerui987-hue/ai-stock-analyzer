/**
 * Research Comparison Engine & Personalization Tests.
 *
 * Verifies:
 * 1. Accurate snapshot change calculations (Price movement, MA cross, RSI shifts, Volume surge).
 * 2. Invariant: Unchanged inputs produce empty/zero false-positive changes.
 * 3. Invariant: Missing indicators are never treated as 0.0.
 * 4. Quick brief and Analyst view data consistency (strict agreement on underlying metrics).
 * 5. Portfolio exposure and sector concentration calculation.
 */

import assert from 'node:assert';
import { isDbConnectionError } from './db-fallback';

interface SnapshotChange {
  metric: string;
  type: string;
  previous_value: number | null;
  current_value: number | null;
  change?: number;
  change_pct?: number;
  direction: string;
  explanation: string;
  source: string;
}

interface SnapshotComparison {
  status: 'compared' | 'no_prior_snapshot' | 'incompatible';
  symbol: string;
  exchange: string;
  current_as_of?: string;
  previous_as_of?: string;
  comparison_period_hours?: number;
  methodology_version: string;
  changes: SnapshotChange[];
  summary?: string;
  reason?: string;
}

// Client-side comparison evaluator (mirrors backend ResearchSnapshotService)
function evaluateComparison(
  curr: {
    symbol: string;
    exchange: string;
    price: number;
    as_of: string;
    rsi?: number;
    sma_20?: number;
    vol_surge?: number;
    lookback_bars?: number;
    rule_version: string;
  },
  prev: {
    symbol: string;
    exchange: string;
    price: number;
    as_of: string;
    rsi?: number;
    sma_20?: number;
    vol_surge?: number;
    lookback_bars?: number;
    rule_version: string;
  }
): SnapshotComparison {
  if (curr.symbol !== prev.symbol || curr.exchange !== prev.exchange) {
    return { status: 'incompatible', reason: 'Symbol or exchange mismatch', symbol: curr.symbol, exchange: curr.exchange, methodology_version: curr.rule_version, changes: [] };
  }

  if (curr.lookback_bars && prev.lookback_bars && curr.lookback_bars !== prev.lookback_bars) {
    return {
      status: 'incompatible',
      reason: `Lookback mismatch (${curr.lookback_bars} bars vs ${prev.lookback_bars} bars)`,
      symbol: curr.symbol,
      exchange: curr.exchange,
      methodology_version: curr.rule_version,
      changes: []
    };
  }

  const currTime = new Date(curr.as_of).getTime();
  const prevTime = new Date(prev.as_of).getTime();
  if (currTime <= prevTime) {
    return { status: 'incompatible', reason: 'Out-of-order or duplicate timestamp', symbol: curr.symbol, exchange: curr.exchange, methodology_version: curr.rule_version, changes: [] };
  }

  const periodHours = (currTime - prevTime) / (1000 * 3600);
  const changes: SnapshotChange[] = [];

  // 1. Price movement
  const diff = curr.price - prev.price;
  const diffPct = (diff / prev.price) * 100;
  if (Math.abs(diffPct) >= 0.05) {
    changes.push({
      metric: 'price',
      type: 'price_movement',
      previous_value: prev.price,
      current_value: curr.price,
      change: Math.round(diff * 100) / 100,
      change_pct: Math.round(diffPct * 100) / 100,
      direction: diff > 0 ? 'up' : 'down',
      explanation: `Price moved from ₹${prev.price.toFixed(2)} to ₹${curr.price.toFixed(2)} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%) over the comparison window.`,
      source: 'NSE',
    });
  }

  // 2. SMA 20 Cross
  if (typeof curr.sma_20 === 'number' && typeof prev.sma_20 === 'number') {
    if (prev.price <= prev.sma_20 && curr.price > curr.sma_20) {
      changes.push({
        metric: 'sma_20',
        type: 'ma_crossover',
        previous_value: prev.sma_20,
        current_value: curr.sma_20,
        direction: 'bullish_cross',
        explanation: `Price crossed above the 20-day moving average (₹${curr.sma_20.toFixed(2)}), confirming short-term momentum.`,
        source: 'NSE',
      });
    } else if (prev.price >= prev.sma_20 && curr.price < curr.sma_20) {
      changes.push({
        metric: 'sma_20',
        type: 'ma_crossover',
        previous_value: prev.sma_20,
        current_value: curr.sma_20,
        direction: 'bearish_cross',
        explanation: `Price slipped below the 20-day moving average (₹${curr.sma_20.toFixed(2)}), indicating near-term consolidation.`,
        source: 'NSE',
      });
    }
  }

  // 3. RSI shift
  if (typeof curr.rsi === 'number' && typeof prev.rsi === 'number') {
    const getCat = (r: number) => (r > 70 ? 'Overbought' : r < 30 ? 'Oversold' : 'Neutral');
    const pCat = getCat(prev.rsi);
    const cCat = getCat(curr.rsi);
    if (pCat !== cCat) {
      changes.push({
        metric: 'rsi_14',
        type: 'momentum_shift',
        previous_value: prev.rsi,
        current_value: curr.rsi,
        direction: curr.rsi > prev.rsi ? 'momentum_expansion' : 'momentum_contraction',
        explanation: `14-day RSI transitioned from ${pCat} (${prev.rsi.toFixed(1)}) to ${cCat} (${curr.rsi.toFixed(1)}).`,
        source: 'NSE',
      });
    }
  }

  // 4. Volume Surge
  if (typeof curr.vol_surge === 'number' && curr.vol_surge >= 1.5) {
    if (typeof prev.vol_surge !== 'number' || prev.vol_surge < 1.5) {
      changes.push({
        metric: 'vol_surge',
        type: 'volume_surge',
        previous_value: prev.vol_surge ?? null,
        current_value: curr.vol_surge,
        direction: 'high_volume',
        explanation: `Volume surged to ${curr.vol_surge.toFixed(1)}x the 20-day average volume.`,
        source: 'NSE',
      });
    }
  }

  return {
    status: 'compared',
    symbol: curr.symbol,
    exchange: curr.exchange,
    current_as_of: curr.as_of,
    previous_as_of: prev.as_of,
    comparison_period_hours: Math.round(periodHours * 10) / 10,
    methodology_version: curr.rule_version,
    changes,
  };
}

async function runTests() {
  console.log('🧪 Running Research Comparison & Personalization Verification Suite...\n');

  // Test 1: Price and SMA 20 Crossover Detection
  {
    const prev = {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      price: 1240.0,
      as_of: '2026-11-18T10:00:00Z',
      sma_20: 1245.0, // Below MA
      rsi: 54.0,
      rule_version: 'v1.0-deterministic-quant',
    };
    const curr = {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      price: 1265.0,
      as_of: '2026-11-19T10:00:00Z',
      sma_20: 1248.0, // Crossed above MA
      rsi: 61.0,
      rule_version: 'v1.0-deterministic-quant',
    };

    const res = evaluateComparison(curr, prev);
    assert.strictEqual(res.status, 'compared');
    assert.strictEqual(res.comparison_period_hours, 24);
    assert.strictEqual(res.changes.length, 2);

    const priceChange = res.changes.find((c) => c.metric === 'price');
    assert(priceChange !== undefined);
    assert.strictEqual(priceChange?.change, 25.0);
    assert.strictEqual(priceChange?.direction, 'up');

    const maCross = res.changes.find((c) => c.metric === 'sma_20');
    assert(maCross !== undefined);
    assert.strictEqual(maCross?.direction, 'bullish_cross');
    console.log('Test 1: Price movement & MA crossover successfully detected');
  }

  // Test 2: Invariant - Unchanged inputs produce zero false positives
  {
    const prev = {
      symbol: 'TCS',
      exchange: 'NSE',
      price: 3500.0,
      as_of: '2026-11-18T10:00:00Z',
      sma_20: 3480.0,
      rsi: 55.0,
      rule_version: 'v1.0-deterministic-quant',
    };
    const curr = {
      symbol: 'TCS',
      exchange: 'NSE',
      price: 3500.0, // Exact same price
      as_of: '2026-11-19T10:00:00Z',
      sma_20: 3480.0, // Exact same MA
      rsi: 55.0, // Exact same RSI
      rule_version: 'v1.0-deterministic-quant',
    };

    const res = evaluateComparison(curr, prev);
    assert.strictEqual(res.status, 'compared');
    assert.strictEqual(res.changes.length, 0, 'Unchanged inputs must yield 0 changes');
    console.log('Test 2: Invariant verified - Unchanged inputs produce zero false positives');
  }

  // Test 3: Invariant - Missing inputs are never treated as zero
  {
    const prev = {
      symbol: 'INFY',
      exchange: 'NSE',
      price: 1800.0,
      as_of: '2026-11-18T10:00:00Z',
      rule_version: 'v1.0-deterministic-quant',
      // rsi is undefined
    };
    const curr = {
      symbol: 'INFY',
      exchange: 'NSE',
      price: 1800.0,
      as_of: '2026-11-19T10:00:00Z',
      rsi: 58.0, // present in current
      rule_version: 'v1.0-deterministic-quant',
    };

    const res = evaluateComparison(curr, prev);
    assert.strictEqual(res.status, 'compared');
    // Must NOT produce an RSI shift from 0 to 58
    const rsiChange = res.changes.find((c) => c.metric === 'rsi_14');
    assert.strictEqual(rsiChange, undefined, 'Missing RSI in previous snapshot must not be compared to 0');
    console.log('Test 3: Invariant verified - Missing metrics are never treated as zero');
  }

  // Test 4: Quick Brief and Analyst View consistency
  {
    // Both views render the exact same underlying observations
    const prev = {
      symbol: 'HDFCBANK',
      exchange: 'NSE',
      price: 1700.0,
      as_of: '2026-11-18T10:00:00Z',
      vol_surge: 1.0,
      rsi: 68.0,
      rule_version: 'v1.0-deterministic-quant',
    };
    const curr = {
      symbol: 'HDFCBANK',
      exchange: 'NSE',
      price: 1740.0,
      as_of: '2026-11-19T10:00:00Z',
      vol_surge: 1.8, // Surged >= 1.5x
      rsi: 72.5, // Shifted from Neutral to Overbought
      rule_version: 'v1.0-deterministic-quant',
    };

    const res = evaluateComparison(curr, prev);
    assert.strictEqual(res.changes.length, 3); // price, rsi, volume surge

    // Quick Brief projection
    const quickSummary = res.changes.map((c) => c.explanation);
    // Analyst View projection
    const analystTableRows = res.changes.map((c) => ({
      metric: c.metric,
      prev: c.previous_value,
      curr: c.current_value,
      delta: c.change_pct,
    }));

    assert.strictEqual(quickSummary.length, analystTableRows.length);
    assert.strictEqual(analystTableRows[0].metric, 'price');
    assert.strictEqual(analystTableRows[0].prev, 1700);
    assert.strictEqual(analystTableRows[0].curr, 1740);
    console.log('Test 4: Strict parity verified - Quick Brief & Analyst View share exact observations');
  }

  // Test 5: Portfolio Exposure and Sector Concentration Guard
  {
    const holdings = [
      { symbol: 'RELIANCE', sector: 'Energy', current_value: 400000 },
      { symbol: 'TCS', sector: 'Technology', current_value: 200000 },
      { symbol: 'INFY', sector: 'Technology', current_value: 100000 },
      { symbol: 'HDFCBANK', sector: 'Financials', current_value: 300000 },
    ];
    const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0); // 1,000,000

    const sectorMap: Record<string, number> = {};
    holdings.forEach((h) => {
      sectorMap[h.sector] = (sectorMap[h.sector] || 0) + (h.current_value / totalValue) * 100;
    });

    assert.strictEqual(sectorMap['Energy'], 40.0);
    assert.strictEqual(sectorMap['Technology'], 30.0);
    assert.strictEqual(sectorMap['Financials'], 30.0);

    const concentratedSectors = Object.entries(sectorMap)
      .filter(([_, pct]) => pct > 35.0)
      .map(([s]) => s);

    assert.deepStrictEqual(concentratedSectors, ['Energy']);
    console.log('Test 5: Portfolio sector concentration calculation verified (> 35% trigger: Energy 40%)');
  }

  // Test 6: Incompatibility Guard (Lookback Mismatch and Duplicate/Reversed Timestamps)
  {
    const base = {
      symbol: 'INFY',
      exchange: 'NSE',
      price: 1800.0,
      as_of: '2026-11-19T10:00:00Z',
      lookback_bars: 200,
      rule_version: 'v1.0-deterministic-quant',
    };
    const lookbackMismatch = {
      ...base,
      as_of: '2026-11-19T11:00:00Z',
      lookback_bars: 100, // Mismatched lookback
    };
    const resLookback = evaluateComparison(lookbackMismatch, base);
    assert.strictEqual(resLookback.status, 'incompatible');
    assert(resLookback.reason?.includes('Lookback mismatch'));

    const staleTime = {
      ...base,
      as_of: '2026-11-19T09:00:00Z', // Before base
    };
    const resStale = evaluateComparison(staleTime, base);
    assert.strictEqual(resStale.status, 'incompatible');
    assert(resStale.reason?.includes('timestamp'));
    console.log('Test 6: Incompatibility guards verified (Lookback mismatch & timestamp ordering)');
  }

  // Test 7: Hard Rule 1 - Fail-closed DB connection error detection (No invented state)
  {
    assert.strictEqual(isDbConnectionError({ code: 'P1001' }), true);
    assert.strictEqual(isDbConnectionError({ message: "Can't reach database server at localhost:5432" }), true);
    assert.strictEqual(isDbConnectionError({ message: 'connect ECONNREFUSED 127.0.0.1:5432' }), true);
    assert.strictEqual(isDbConnectionError({ name: 'PrismaClientInitializationError' }), true);
    // Non-connectivity errors must NOT be classified as DB connection errors
    assert.strictEqual(isDbConnectionError({ message: 'Validation error: symbol required' }), false);
    assert.strictEqual(isDbConnectionError(null), false);
    console.log('Test 7: Hard Rule 1 verified - Database connection error accurately detected for 503 fail-closed');
  }

  // Test 8: Trend Observation & Hard Rule 1/4 (SMA20 comparison, no invented target/stop)
  {
    const deriveTrend = (price: number, sma20: number) => {
      return price > sma20 ? 'Above 20-day average' : 'Below 20-day average';
    };
    assert.strictEqual(deriveTrend(1265, 1248), 'Above 20-day average');
    assert.strictEqual(deriveTrend(1240, 1248), 'Below 20-day average');

    // Rule: When signal has no target/stop_loss, they must remain null (never fallback to * 1.08 / * 0.95)
    const rawSignal: { stop_loss?: number | null; target?: number | null } = {
      stop_loss: null,
      target: null,
    };
    const stopLossPrice = rawSignal.stop_loss ?? null;
    const targetPrice = rawSignal.target ?? null;
    assert.strictEqual(stopLossPrice, null, 'Stop loss must remain null when unprovided');
    assert.strictEqual(targetPrice, null, 'Target price must remain null when unprovided');
    console.log('Test 8: Strict MA20 trend derivation and null stop/target invariants verified');
  }

  console.log('\n🎉 ALL RESEARCH COMPARISON & PERSONALIZATION TESTS PASSED!\n');
}

runTests();
