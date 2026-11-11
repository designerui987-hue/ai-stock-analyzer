/**
 * Deterministic Quantitative Signal Generation Engine.
 *
 * Implements the specification in docs/CONFIDENCE.md:
 * - Filters out incomplete current/intraday bars before entry calculations.
 * - Computes Wilder RSI(14), Wilder ATR(14), SMA20, SMA50 (null when < 50 bars),
 *   and real MACD(12, 26, 9) using EMA(9) of the MACD time series (requires >= 35 bars).
 * - Never substitutes SMA20/price for missing SMA50 or approximates MACD signal as 0.85x.
 * - Uses observation timestamp from the latest completed bar (never fabricates `now()`).
 */

export const RULE_VERSION = 'v1.1-deterministic-quant';

export type DailyBar = {
  date: string;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  completed?: boolean;
};

export type IndicatorSet = {
  price: number;
  sma20: number;
  sma50: number | null;
  rsi: number | null;
  atr: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  volSurge: number | null;
  barCount: number;
  asOfDate: string;
};

export type DeterministicSignal = {
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  confidence_pct: number;
  horizon_days: number;
  rationale: string;
  rule_version: string;
  source: string;
  as_of: string;
  model_breakdown: string;
};

function calculateEMASeries(data: number[], span: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (span + 1);
  const series: number[] = new Array(data.length);
  series[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    series[i] = data[i] * k + series[i - 1] * (1 - k);
  }
  return series;
}

function calculateWilderRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function calculateWilderATR(bars: DailyBar[], period: number = 14): number | null {
  if (bars.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose)
    );
    trueRanges.push(tr);
  }

  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return Math.round(atr * 100) / 100;
}

/**
 * Filter out incomplete / unclosed bars before indicator or signal generation.
 */
export function filterCompletedBars(
  bars: DailyBar[],
  requireCompletedCandles: boolean = true
): DailyBar[] {
  if (!bars) return [];
  if (!requireCompletedCandles) return bars;
  return bars.filter((b) => b.completed !== false);
}

/**
 * Calculates quantitative indicators from completed chronological OHLCV bars.
 * Returns null if fewer than 20 completed bars are available.
 */
export function calculateIndicators(
  bars: DailyBar[],
  options: { requireCompletedCandles?: boolean } = {}
): IndicatorSet | null {
  const completedBars = filterCompletedBars(
    bars,
    options.requireCompletedCandles ?? true
  );
  if (completedBars.length < 20) {
    return null;
  }

  const closes = completedBars.map((b) => b.close);
  const volumes = completedBars.map((b) => b.volume || 0);
  const n = closes.length;
  const price = closes[n - 1];
  const lastBar = completedBars[n - 1];

  // 1. SMA 20 & SMA 50 (never substitute sma20 when n < 50)
  const sma20 =
    Math.round((closes.slice(-20).reduce((a, b) => a + b, 0) / 20) * 100) / 100;
  const sma50 =
    n >= 50
      ? Math.round((closes.slice(-50).reduce((a, b) => a + b, 0) / 50) * 100) / 100
      : null;

  // 2. Wilder RSI 14
  const rsi = calculateWilderRSI(closes, 14);

  // 3. Wilder ATR 14
  const atr = calculateWilderATR(completedBars, 14);

  // 4. Real MACD (12, 26, 9) using EMA(9) over full MACD series (warm-up >= 35 bars)
  let macd: number | null = null;
  let macdSignal: number | null = null;
  let macdHist: number | null = null;
  if (n >= 35) {
    const ema12Series = calculateEMASeries(closes, 12);
    const ema26Series = calculateEMASeries(closes, 26);
    const macdSeries = ema12Series.map((v, idx) => v - ema26Series[idx]);
    const signalSeries = calculateEMASeries(macdSeries, 9);
    const rawMacd = macdSeries[n - 1];
    const rawSig = signalSeries[n - 1];
    macd = Math.round(rawMacd * 1000) / 1000;
    macdSignal = Math.round(rawSig * 1000) / 1000;
    macdHist = Math.round((rawMacd - rawSig) * 1000) / 1000;
  }

  // 5. Volume Surge
  const vol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[n - 1];
  const volSurge =
    vol20 > 0 ? Math.round((lastVol / vol20) * 100) / 100 : null;

  return {
    price,
    sma20,
    sma50,
    rsi,
    atr,
    macd,
    macdSignal,
    macdHist,
    volSurge,
    barCount: n,
    asOfDate: lastBar.date,
  };
}

/**
 * Computes transparent confidence score based on docs/CONFIDENCE.md.
 */
export function computeConfidenceScore(
  ind: IndicatorSet,
  bullAgreementCount: number,
  bearAgreementCount: number,
  signalType: 'BUY' | 'SELL'
): { score: number; breakdown: Record<string, any> } {
  const basePoints = 40;

  // Data Completeness: 0 to 20 pts
  let dataPoints = 0;
  if (ind.barCount >= 200) dataPoints += 10;
  else if (ind.barCount >= 50) dataPoints += 5;

  if (
    ind.atr !== null &&
    ind.atr > 0 &&
    ind.rsi !== null &&
    ind.rsi > 0 &&
    ind.sma20 > 0 &&
    ind.sma50 !== null &&
    ind.sma50 > 0 &&
    ind.macdSignal !== null
  ) {
    dataPoints += 10;
  } else {
    dataPoints += 4;
  }

  // Rule Consensus: 0 to 40 pts
  const agreement = signalType === 'BUY' ? bullAgreementCount : bearAgreementCount;
  let rulePoints = 0;
  if (agreement >= 5) rulePoints = 40;
  else if (agreement === 4) rulePoints = 30;
  else if (agreement === 3) rulePoints = 20;
  else if (agreement === 2) rulePoints = 10;
  else rulePoints = 5;

  const total = Math.min(100, Math.max(40, basePoints + dataPoints + rulePoints));

  return {
    score: total,
    breakdown: {
      formula: 'Base(40) + DataCompleteness(0-20) + RuleConsensus(0-40)',
      base_points: basePoints,
      data_completeness_points: dataPoints,
      rule_consensus_points: rulePoints,
      rules_agreed: agreement,
      total_rules: 5,
      is_win_probability: false,
      disclaimer:
        'Confidence represents rule agreement and data quality; it is not a statistical win probability.',
    },
  };
}

/**
 * Generates deterministic signal for a given stock using completed daily bars.
 * Returns null if required indicators cannot be warmed up cleanly.
 */
export function generateDeterministicSignal(
  symbol: string,
  bars: DailyBar[],
  options: { requireCompletedCandles?: boolean } = {}
): DeterministicSignal | null {
  const ind = calculateIndicators(bars, options);
  if (!ind || ind.atr === null || ind.atr <= 0 || ind.rsi === null) {
    return null;
  }

  const { price, sma20, sma50, rsi, atr, macd, macdSignal, macdHist, volSurge } = ind;
  const indicatorsWarmedUp =
    sma50 !== null && macd !== null && macdSignal !== null && macdHist !== null;

  const bullRules = {
    trend: sma50 !== null && price > sma20 && sma20 >= sma50,
    rsi: rsi >= 40 && rsi <= 65,
    macd: macd !== null && macdSignal !== null && macdHist !== null && macd > macdSignal && macdHist > 0,
    volume: volSurge !== null && volSurge >= 1.05,
    atrLiquidity: atr >= price * 0.005,
  };

  const bearRules = {
    trend: sma50 !== null && price < sma20 && sma20 <= sma50,
    rsi: rsi <= 60 && rsi >= 35,
    macd: macd !== null && macdSignal !== null && macdHist !== null && macd < macdSignal && macdHist < 0,
    volume: volSurge !== null && volSurge >= 1.05,
    atrLiquidity: atr >= price * 0.005,
  };

  const bullCount = Object.values(bullRules).filter(Boolean).length;
  const bearCount = Object.values(bearRules).filter(Boolean).length;

  let signalType: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let targetPrice = Math.round((price + 3.0 * atr) * 100) / 100;
  let stopLossPrice = Math.round((price - 1.5 * atr) * 100) / 100;
  let rationale = '';

  if (indicatorsWarmedUp && bullCount >= 3 && bullCount > bearCount) {
    signalType = 'BUY';
    stopLossPrice = Math.round((price - 1.5 * atr) * 100) / 100;
    targetPrice = Math.round((price + 3.0 * atr) * 100) / 100;
    rationale = `Bullish consensus (${bullCount}/5 rules). Trend (P:₹${price} > SMA20:₹${sma20} >= SMA50:₹${sma50}), Wilder RSI:${rsi}, MACD hist:${macdHist}, ATR:₹${atr}.`;
  } else if (indicatorsWarmedUp && bearCount >= 3 && bearCount > bullCount) {
    signalType = 'SELL';
    stopLossPrice = Math.round((price + 1.5 * atr) * 100) / 100;
    targetPrice = Math.round((price - 3.0 * atr) * 100) / 100;
    rationale = `Bearish consensus (${bearCount}/5 rules). Trend (P:₹${price} < SMA20:₹${sma20} <= SMA50:₹${sma50}), Wilder RSI:${rsi}, MACD hist:${macdHist}, ATR:₹${atr}.`;
  } else {
    signalType = 'HOLD';
    rationale = indicatorsWarmedUp
      ? `Neutral consensus (${bullCount} bull vs ${bearCount} bear). Market structure consolidating.`
      : `Insufficient warm-up bars (${ind.barCount} completed bars; need >= 50 for full SMA50/MACD consensus).`;
  }

  const { score, breakdown } = computeConfidenceScore(
    ind,
    bullCount,
    bearCount,
    signalType === 'SELL' ? 'SELL' : 'BUY'
  );

  // Derive observation timestamp from latest completed bar rather than wall-clock now()
  const parsedAsOf =
    ind.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(ind.asOfDate)
      ? `${ind.asOfDate}T10:00:00.000Z`
      : ind.asOfDate;

  return {
    symbol: symbol.toUpperCase(),
    signal_type: signalType,
    entry_price: Math.round(price * 100) / 100,
    target_price: targetPrice,
    stop_loss_price: stopLossPrice,
    confidence_pct: score,
    horizon_days: 14,
    rationale,
    rule_version: RULE_VERSION,
    source: 'yfinance',
    as_of: parsedAsOf,
    model_breakdown: JSON.stringify({
      ...breakdown,
      indicators: {
        price,
        sma20,
        sma50,
        rsi,
        atr,
        macd,
        macd_signal: macdSignal,
        macd_hist: macdHist,
        vol_surge: volSurge,
      },
    }),
  };
}
