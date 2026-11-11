/**
 * Audit Regression Tests (Frontend Indicators & Order Execution Safety)
 *
 * Verifies:
 * 1. deterministic-signals.ts computes real EMA(9) MACD signal (never 0.85 * MACD).
 * 2. deterministic-signals.ts returns sma50 === null when < 50 bars exist (no sma20 fallback).
 * 3. deterministic-signals.ts excludes incomplete trailing bars & sets as_of to last bar date.
 * 4. validateQuoteForOrder rejects missing, unavailable, stale, and cross-exchange quotes.
 * 5. simulatePaperExecution enforces NSE closed queueing, BUY LIMIT < LTP resting OPEN, and Indian equity fees.
 */

import assert from 'node:assert';
import {
  calculateIndicators,
  generateDeterministicSignal,
  DailyBar,
} from './deterministic-signals';
import {
  evaluateNseSession,
  validateQuoteForOrder,
  simulatePaperExecution,
  calculateIndianEquityFees,
} from './orders/execution';

function buildBars(count: number, fn: (i: number) => number): DailyBar[] {
  const bars: DailyBar[] = [];
  const start = new Date('2026-06-01T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const close = Number(fn(i).toFixed(2));
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: Number((close - 1).toFixed(2)),
      high: Number((close + 2).toFixed(2)),
      low: Number((close - 2).toFixed(2)),
      close,
      volume: 100000 + i * 100,
      completed: true,
    });
  }
  return bars;
}

function runTests() {
  console.log('Running Frontend Indicator & Order Execution Regression Tests...');

  // 1. Short bar count (< 50): sma50 must be null and macd/macdSignal must be null when < 35
  const short25 = buildBars(25, (i) => 100 + i * 0.5);
  const indShort = calculateIndicators(short25);
  assert.ok(indShort, 'Indicators should compute with 25 bars');
  assert.strictEqual(indShort.sma50, null, 'sma50 must be null with < 50 bars');
  assert.strictEqual(indShort.macd, null, 'macd must be null with < 35 bars');
  assert.strictEqual(indShort.macdSignal, null, 'macdSignal must be null with < 35 bars');
  assert.notStrictEqual(indShort.rsi, null, 'rsi should compute with 25 bars');

  // 2. Real EMA(9) MACD signal differs strictly from broken MACD * 0.85 approximation
  const wave60 = buildBars(60, (i) => 2500 + Math.sin(i / 4) * 50 + (i < 45 ? i * 1.5 : -i * 2.0));
  const indWave = calculateIndicators(wave60);
  assert.ok(indWave);
  assert.notStrictEqual(indWave.macd, null);
  assert.notStrictEqual(indWave.macdSignal, null);
  assert.notStrictEqual(indWave.sma50, null);
  assert.notStrictEqual(
    Number(indWave.macdSignal!.toFixed(2)),
    Number((indWave.macd! * 0.85).toFixed(2)),
    'macdSignal must come from EMA(9) of MACD series, not MACD * 0.85'
  );

  // 3. Incomplete bar exclusion & as_of timestamp derived from completed bar
  const withIncomplete: DailyBar[] = [
    ...wave60,
    {
      date: '2026-09-30',
      open: 1000,
      high: 9999,
      low: 1000,
      close: 9999,
      volume: 1,
      completed: false,
    },
  ];
  const sigExcl = generateDeterministicSignal('RELIANCE', withIncomplete, {
    requireCompletedCandles: true,
  });
  assert.ok(sigExcl);
  assert.strictEqual(sigExcl.as_of, `${wave60[wave60.length - 1].date}T10:00:00.000Z`);
  assert.strictEqual(sigExcl.entry_price, wave60[wave60.length - 1].close);

  // 4. NSE Session evaluator (holiday, special session, regular)
  assert.strictEqual(evaluateNseSession(new Date('2026-11-04T05:30:00Z')).session, 'REGULAR');
  assert.strictEqual(evaluateNseSession(new Date('2026-01-26T05:30:00Z')).open, false);
  assert.strictEqual(evaluateNseSession(new Date('2026-11-08T12:45:00Z')).session, 'SPECIAL_SESSION');

  // 5. Quote freshness gate rejects unavailable / stale / cross-exchange
  const now = new Date('2026-11-04T06:00:00Z');
  assert.strictEqual(
    validateQuoteForOrder(null, { expectedSymbol: 'TCS', expectedExchange: 'NSE', maxAgeSeconds: 60, nowUtc: now }).valid,
    false
  );
  assert.strictEqual(
    validateQuoteForOrder(
      { symbol: 'TCS', exchange: 'NSE', price: 3900, status: 'unavailable', source: 'unavailable' },
      { expectedSymbol: 'TCS', expectedExchange: 'NSE', maxAgeSeconds: 60, nowUtc: now }
    ).valid,
    false
  );
  assert.strictEqual(
    validateQuoteForOrder(
      {
        symbol: 'TCS',
        exchange: 'NSE',
        price: 3900,
        status: 'ok',
        source: 'yfinance',
        as_of: new Date(now.getTime() - 300_000).toISOString(),
      },
      { expectedSymbol: 'TCS', expectedExchange: 'NSE', maxAgeSeconds: 60, nowUtc: now }
    ).valid,
    false
  );
  assert.strictEqual(
    validateQuoteForOrder(
      {
        symbol: 'TCS',
        exchange: 'BSE',
        price: 3900,
        status: 'ok',
        source: 'kite',
        as_of: new Date(now.getTime() - 5_000).toISOString(),
      },
      { expectedSymbol: 'TCS', expectedExchange: 'NSE', maxAgeSeconds: 60, nowUtc: now }
    ).valid,
    false
  );
  const validQ = validateQuoteForOrder(
    {
      symbol: 'TCS',
      exchange: 'NSE',
      price: 3900,
      status: 'ok',
      source: 'kite_ws',
      as_of: new Date(now.getTime() - 5_000).toISOString(),
    },
    { expectedSymbol: 'TCS', expectedExchange: 'NSE', maxAgeSeconds: 60, nowUtc: now }
  );
  assert.strictEqual(validQ.valid, true);
  assert.strictEqual(validQ.price, 3900);

  // 6. Paper Execution Simulator realism
  const closedQueued = simulatePaperExecution({
    transaction_type: 'BUY',
    order_type: 'MARKET',
    product_type: 'CNC',
    quantity: 10,
    quotePrice: 2500,
    marketOpen: false,
    marketSession: 'CLOSED',
  });
  assert.strictEqual(closedQueued.status, 'OPEN');
  assert.strictEqual(closedQueued.filled, false);

  const restingBuyLimit = simulatePaperExecution({
    transaction_type: 'BUY',
    order_type: 'LIMIT',
    product_type: 'CNC',
    quantity: 10,
    quotePrice: 2500,
    limitPrice: 2450,
    marketOpen: true,
    marketSession: 'REGULAR',
  });
  assert.strictEqual(restingBuyLimit.status, 'OPEN');
  assert.strictEqual(restingBuyLimit.filled, false);

  const filledMarket = simulatePaperExecution({
    transaction_type: 'BUY',
    order_type: 'MARKET',
    product_type: 'CNC',
    quantity: 10,
    quotePrice: 2500,
    marketOpen: true,
    marketSession: 'REGULAR',
  });
  assert.strictEqual(filledMarket.status, 'FILLED');
  assert.strictEqual(filledMarket.filled, true);
  assert.ok((filledMarket.execution_price || 0) >= 2500);
  assert.ok(filledMarket.fees_inr > 0);
  const fees = calculateIndianEquityFees(25000, 'BUY', 'CNC');
  assert.ok(fees.stt > 0 && fees.stamp_duty > 0 && fees.gst > 0);

  console.log('All Frontend Indicator & Order Execution Regression Tests Passed!');
}

runTests();
