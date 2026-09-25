export interface OptionContract {
  oi: number;
  oi_change: number;
  volume: number;
  iv: number;
  ltp: number;
  bid: number;
  ask: number;
}

export interface OptionChainEntry {
  symbol: string;
  expiry_date: string; // e.g. "2026-07-30"
  strike_price: number;
  call: OptionContract;
  put: OptionContract;
}

export interface OptionChainSummary {
  symbol: string;
  spot_price: number;
  atm_strike: number;
  max_pain: number;
  pcr: number;
  pcr_signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  atm_iv: number;
  days_to_expiry: number;
  support_strike: number;
  resistance_strike: number;
  iv_skew: string;
  top_call_oi_buildup: { strike: number; oi_change: number }[];
  top_put_oi_buildup: { strike: number; oi_change: number }[];
  rollover_pct: number;
}

/**
 * Pure Calculation Functions
 */

// 1. Calculate Put-Call Ratio (PCR)
export function calculatePCR(entries: OptionChainEntry[]): number {
  let totalCallOI = 0;
  let totalPutOI = 0;

  for (const entry of entries) {
    totalCallOI += entry.call.oi;
    totalPutOI += entry.put.oi;
  }

  if (totalCallOI === 0) return 0;
  return parseFloat((totalPutOI / totalCallOI).toFixed(2));
}

// 2. Calculate Max Pain Strike
export function calculateMaxPain(entries: OptionChainEntry[]): number {
  if (!entries || entries.length === 0) return 0;

  let minLoss = Infinity;
  let maxPainStrike = entries[0].strike_price;

  for (const targetStrike of entries) {
    const sPrice = targetStrike.strike_price;
    let totalLoss = 0;

    for (const entry of entries) {
      const strike = entry.strike_price;
      
      // Call Loss: If spot settles at sPrice, calls with strike < sPrice are in the money
      if (sPrice > strike) {
        totalLoss += (sPrice - strike) * entry.call.oi;
      }
      
      // Put Loss: If spot settles at sPrice, puts with strike > sPrice are in the money
      if (sPrice < strike) {
        totalLoss += (strike - sPrice) * entry.put.oi;
      }
    }

    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = sPrice;
    }
  }

  return maxPainStrike;
}

// 3. Support and Resistance Inference based on highest Put/Call OI
export function inferSupportResistance(entries: OptionChainEntry[], spotPrice: number): { support: number; resistance: number } {
  let maxPutOI = -1;
  let support = spotPrice;

  let maxCallOI = -1;
  let resistance = spotPrice;

  for (const entry of entries) {
    // Highest Put OI at or below spot = Support
    if (entry.strike_price <= spotPrice && entry.put.oi > maxPutOI) {
      maxPutOI = entry.put.oi;
      support = entry.strike_price;
    }

    // Highest Call OI at or above spot = Resistance
    if (entry.strike_price >= spotPrice && entry.call.oi > maxCallOI) {
      maxCallOI = entry.call.oi;
      resistance = entry.strike_price;
    }
  }

  return { support, resistance };
}

// 4. Top 5 OI buildup for Calls and Puts
export function getTopOIChanges(entries: OptionChainEntry[]) {
  const callEntries = [...entries]
    .map((e) => ({ strike: e.strike_price, oi_change: e.call.oi_change }))
    .sort((a, b) => b.oi_change - a.oi_change)
    .slice(0, 5);

  const putEntries = [...entries]
    .map((e) => ({ strike: e.strike_price, oi_change: e.put.oi_change }))
    .sort((a, b) => b.oi_change - a.oi_change)
    .slice(0, 5);

  return { top_call_oi_buildup: callEntries, top_put_oi_buildup: putEntries };
}

// 5. IV Skew Summary
export function getIVSkewSummary(entries: OptionChainEntry[], spotPrice: number): string {
  if (!entries || entries.length === 0) return 'Neutral';

  // Find ATM entry
  const atmEntry = entries.reduce((prev, curr) =>
    Math.abs(curr.strike_price - spotPrice) < Math.abs(prev.strike_price - spotPrice) ? curr : prev
  );

  const otmCall = entries.find((e) => e.strike_price >= spotPrice * 1.04) || atmEntry;
  const otmPut = [...entries].reverse().find((e) => e.strike_price <= spotPrice * 0.96) || atmEntry;

  const otmCallIV = otmCall.call.iv;
  const otmPutIV = otmPut.put.iv;

  if (otmPutIV > otmCallIV + 3) {
    return 'Put Skew (Downside Protection Demand)';
  } else if (otmCallIV > otmPutIV + 3) {
    return 'Call Skew (Upside Volatility Demand)';
  }
  return 'Balanced Volatility Skew';
}

// 6. Rollover % calculation
export function calculateRollover(nearMonthOI: number, nextMonthOI: number): number {
  const total = nearMonthOI + nextMonthOI;
  if (total === 0) return 0;
  return parseFloat(((nextMonthOI / total) * 100).toFixed(1));
}

/**
 * Mock Option Chain Generator
 */
export function generateMockOptionChain(symbol: string, spotPrice: number, expiryDate: string = '2026-07-30'): OptionChainEntry[] {
  // Determine strike step (e.g. 50 for price < 3000, 100 for price >= 3000)
  const step = spotPrice > 5000 ? 250 : spotPrice > 2000 ? 50 : spotPrice > 500 ? 20 : 10;
  const atmStrike = Math.round(spotPrice / step) * step;

  const entries: OptionChainEntry[] = [];
  const strikeCount = 17; // 8 below, 1 ATM, 8 above
  const startStrike = atmStrike - Math.floor(strikeCount / 2) * step;

  for (let i = 0; i < strikeCount; i++) {
    const strike = startStrike + i * step;
    const isATM = strike === atmStrike;

    // IV Smile calculation (higher IV for OTM puts & calls)
    const distFromATM = Math.abs(strike - atmStrike) / step;
    const baseIV = 18 + Math.random() * 2;
    const callIV = parseFloat((baseIV + distFromATM * 0.75 + (strike < atmStrike ? -0.5 : 1.2)).toFixed(1));
    const putIV = parseFloat((baseIV + distFromATM * 0.95 + (strike < atmStrike ? 2.1 : -0.5)).toFixed(1));

    // OI Distribution - peak at round strikes
    const isRoundNumber = strike % (step * 2) === 0;
    const oiBase = isRoundNumber ? 120000 : 45000;
    const oiFactor = Math.max(0.1, 1 - distFromATM * 0.08);

    const callOI = Math.round((oiBase + Math.sin(i * 0.8) * 15000) * oiFactor);
    const putOI = Math.round((oiBase + Math.cos(i * 0.8) * 15000) * oiFactor);

    const callOIChg = Math.round((Math.random() - 0.4) * 8000);
    const putOIChg = Math.round((Math.random() - 0.35) * 8000);

    // Pricing approximations
    const callIntrinsic = Math.max(0, spotPrice - strike);
    const putIntrinsic = Math.max(0, strike - spotPrice);

    const callTimeValue = Math.max(5, (10 - distFromATM * 0.9) * (spotPrice * 0.005));
    const putTimeValue = Math.max(5, (10 - distFromATM * 0.9) * (spotPrice * 0.005));

    const callLTP = parseFloat((callIntrinsic + callTimeValue).toFixed(2));
    const putLTP = parseFloat((putIntrinsic + putTimeValue).toFixed(2));

    entries.push({
      symbol,
      expiry_date: expiryDate,
      strike_price: strike,
      call: {
        oi: Math.max(1000, callOI),
        oi_change: callOIChg,
        volume: Math.round(callOI * 0.45),
        iv: callIV,
        ltp: callLTP,
        bid: parseFloat((callLTP * 0.995).toFixed(2)),
        ask: parseFloat((callLTP * 1.005).toFixed(2)),
      },
      put: {
        oi: Math.max(1000, putOI),
        oi_change: putOIChg,
        volume: Math.round(putOI * 0.45),
        iv: putIV,
        ltp: putLTP,
        bid: parseFloat((putLTP * 0.995).toFixed(2)),
        ask: parseFloat((putLTP * 1.005).toFixed(2)),
      },
    });
  }

  return entries;
}

/**
 * Get Full Option Chain Analysis Summary
 */
export function getOptionChainSummary(symbol: string, spotPrice: number, expiryDate: string = '2026-07-30'): {
  entries: OptionChainEntry[];
  summary: OptionChainSummary;
} {
  const entries = generateMockOptionChain(symbol, spotPrice, expiryDate);
  const step = spotPrice > 5000 ? 250 : spotPrice > 2000 ? 50 : spotPrice > 500 ? 20 : 10;
  const atmStrike = Math.round(spotPrice / step) * step;

  const pcr = calculatePCR(entries);
  const maxPain = calculateMaxPain(entries);
  const { support, resistance } = inferSupportResistance(entries, spotPrice);
  const { top_call_oi_buildup, top_put_oi_buildup } = getTopOIChanges(entries);
  const ivSkew = getIVSkewSummary(entries, spotPrice);

  const atmEntry = entries.find((e) => e.strike_price === atmStrike) || entries[0];
  const atmIV = parseFloat(((atmEntry.call.iv + atmEntry.put.iv) / 2).toFixed(1));

  let pcrSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (pcr > 1.3) pcrSignal = 'BULLISH';
  else if (pcr < 0.7) pcrSignal = 'BEARISH';

  const summary: OptionChainSummary = {
    symbol,
    spot_price: spotPrice,
    atm_strike: atmStrike,
    max_pain: maxPain,
    pcr,
    pcr_signal: pcrSignal,
    atm_iv: atmIV,
    days_to_expiry: 4,
    support_strike: support,
    resistance_strike: resistance,
    iv_skew: ivSkew,
    top_call_oi_buildup,
    top_put_oi_buildup,
    rollover_pct: 74.2,
  };

  return { entries, summary };
}
