export const FO_LOT_SIZES: Record<string, number> = {
  NIFTY: 75,
  BANKNIFTY: 35,
  FINNIFTY: 40,
  MIDCPNIFTY: 75,
  RELIANCE: 250,
  TCS: 175,
  HDFCBANK: 550,
  INFY: 400,
  ICICIBANK: 700,
  BHARTIARTL: 475,
  SBIN: 750,
  ITC: 1600,
  TATAMOTORS: 1425,
  WIPRO: 1500,
  LT: 150,
  TATASTEEL: 5500,
  SUNPHARMA: 350,
  ADANIENT: 300,
  BAJFINANCE: 125,
  KOTAKBANK: 400,
  HCLTECH: 350,
  MARUTI: 100,
  HINDUNILVR: 300,
  TECHM: 600,
};

export function getFOLotSize(symbol: string): number {
  const upper = symbol.toUpperCase();
  return FO_LOT_SIZES[upper] || 500; // Default lot size fallback
}

export interface PositionSizingInput {
  account_capital: number;
  risk_pct: number;
  entry_price: number;
  stop_loss_price: number;
  target_price: number;
  max_concentration_pct?: number;
  symbol?: string;
}

export interface PositionSizingResult {
  risk_per_share: number;
  max_risk_amount: number;
  position_size_shares: number;
  position_size_lots: number;
  lot_size: number;
  position_value: number;
  reward_per_share: number;
  risk_reward_ratio: number;
  rr_quality: 'EXCELLENT' | 'GOOD' | 'POOR';
  position_value_pct: number;
  is_concentration_breached: boolean;
  max_concentration_pct: number;
  error?: string;
}

export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const {
    account_capital,
    risk_pct,
    entry_price,
    stop_loss_price,
    target_price,
    max_concentration_pct = 20,
    symbol = 'RELIANCE',
  } = input;

  const lotSize = getFOLotSize(symbol);

  // Input Validation & Edge Cases
  if (account_capital <= 0) {
    return {
      risk_per_share: 0,
      max_risk_amount: 0,
      position_size_shares: 0,
      position_size_lots: 0,
      lot_size: lotSize,
      position_value: 0,
      reward_per_share: 0,
      risk_reward_ratio: 0,
      rr_quality: 'POOR',
      position_value_pct: 0,
      is_concentration_breached: false,
      max_concentration_pct,
      error: 'Account capital must be greater than zero',
    };
  }

  if (entry_price <= 0) {
    return {
      risk_per_share: 0,
      max_risk_amount: 0,
      position_size_shares: 0,
      position_size_lots: 0,
      lot_size: lotSize,
      position_value: 0,
      reward_per_share: 0,
      risk_reward_ratio: 0,
      rr_quality: 'POOR',
      position_value_pct: 0,
      is_concentration_breached: false,
      max_concentration_pct,
      error: 'Entry price must be greater than zero',
    };
  }

  const riskPerShare = Math.abs(entry_price - stop_loss_price);

  if (riskPerShare === 0) {
    return {
      risk_per_share: 0,
      max_risk_amount: 0,
      position_size_shares: 0,
      position_size_lots: 0,
      lot_size: lotSize,
      position_value: 0,
      reward_per_share: Math.abs(target_price - entry_price),
      risk_reward_ratio: 0,
      rr_quality: 'POOR',
      position_value_pct: 0,
      is_concentration_breached: false,
      max_concentration_pct,
      error: 'Stop loss equals entry price (Zero risk denominator)',
    };
  }

  const maxRiskAmount = account_capital * (Math.max(0, risk_pct) / 100);
  const rawShares = Math.floor(maxRiskAmount / riskPerShare);
  const positionSizeShares = Math.max(0, rawShares);
  const positionSizeLots = Math.floor(positionSizeShares / lotSize);
  const positionValue = positionSizeShares * entry_price;

  const rewardPerShare = Math.abs(target_price - entry_price);
  const rawRR = rewardPerShare / riskPerShare;
  const riskRewardRatio = parseFloat(rawRR.toFixed(2));

  let rrQuality: 'EXCELLENT' | 'GOOD' | 'POOR' = 'POOR';
  if (riskRewardRatio >= 2.0) rrQuality = 'EXCELLENT';
  else if (riskRewardRatio >= 1.5) rrQuality = 'GOOD';

  const positionValuePct = parseFloat(((positionValue / account_capital) * 100).toFixed(1));
  const isConcentrationBreached = positionValuePct > max_concentration_pct;

  return {
    risk_per_share: parseFloat(riskPerShare.toFixed(2)),
    max_risk_amount: parseFloat(maxRiskAmount.toFixed(2)),
    position_size_shares: positionSizeShares,
    position_size_lots: positionSizeLots,
    lot_size: lotSize,
    position_value: parseFloat(positionValue.toFixed(2)),
    reward_per_share: parseFloat(rewardPerShare.toFixed(2)),
    risk_reward_ratio: riskRewardRatio,
    rr_quality: rrQuality,
    position_value_pct: positionValuePct,
    is_concentration_breached: isConcentrationBreached,
    max_concentration_pct,
  };
}

export interface HoldingPosition {
  symbol: string;
  name: string;
  qty: number;
  avg_price: number;
  current_price: number;
  stop_loss?: number;
  sector: string;
}

export interface PortfolioHeatResult {
  total_portfolio_value: number;
  total_risk_amount: number;
  total_heat_pct: number;
  is_heat_warning: boolean;
  positions_risk: {
    symbol: string;
    qty: number;
    current_val: number;
    stop_loss: number;
    risk_amount: number;
    risk_pct_of_capital: number;
  }[];
}

export function calculatePortfolioHeat(holdings: HoldingPosition[], accountCapital: number): PortfolioHeatResult {
  let totalValue = 0;
  let totalRisk = 0;

  const positionsRisk = holdings.map((h) => {
    const currentVal = h.qty * h.current_price;
    totalValue += currentVal;

    // Use explicit SL if available, otherwise default to 5% trailing SL below avg price
    const sl = h.stop_loss || h.avg_price * 0.95;
    const riskPerShare = Math.max(0, h.current_price - sl);
    const riskAmount = h.qty * riskPerShare;
    totalRisk += riskAmount;

    const riskPctOfCap = accountCapital > 0 ? (riskAmount / accountCapital) * 100 : 0;

    return {
      symbol: h.symbol,
      qty: h.qty,
      current_val: parseFloat(currentVal.toFixed(2)),
      stop_loss: parseFloat(sl.toFixed(2)),
      risk_amount: parseFloat(riskAmount.toFixed(2)),
      risk_pct_of_capital: parseFloat(riskPctOfCap.toFixed(2)),
    };
  });

  const capToUse = accountCapital > 0 ? accountCapital : totalValue;
  const totalHeatPct = capToUse > 0 ? parseFloat(((totalRisk / capToUse) * 100).toFixed(2)) : 0;
  const isHeatWarning = totalHeatPct >= 6.0; // Flag red if > 6% total risk if all SL hit

  return {
    total_portfolio_value: parseFloat(totalValue.toFixed(2)),
    total_risk_amount: parseFloat(totalRisk.toFixed(2)),
    total_heat_pct: totalHeatPct,
    is_heat_warning: isHeatWarning,
    positions_risk: positionsRisk,
  };
}

export interface SectorConcentrationResult {
  sectors: {
    sector: string;
    value: number;
    pct: number;
    is_breached: boolean;
  }[];
  breached_sectors: string[];
}

export function calculateSectorConcentration(holdings: HoldingPosition[], accountCapital: number): SectorConcentrationResult {
  const sectorMap: Record<string, number> = {};
  let totalVal = 0;

  for (const h of holdings) {
    const val = h.qty * h.current_price;
    sectorMap[h.sector] = (sectorMap[h.sector] || 0) + val;
    totalVal += val;
  }

  const baseVal = accountCapital > 0 ? accountCapital : totalVal;
  const breachedSectors: string[] = [];

  const sectors = Object.entries(sectorMap).map(([sector, value]) => {
    const pct = baseVal > 0 ? parseFloat(((value / baseVal) * 100).toFixed(1)) : 0;
    const isBreached = pct > 35; // Sector concentration warning if > 35%
    if (isBreached) breachedSectors.push(sector);

    return {
      sector,
      value: parseFloat(value.toFixed(2)),
      pct,
      is_breached: isBreached,
    };
  }).sort((a, b) => b.pct - a.pct);

  return { sectors, breached_sectors: breachedSectors };
}

export function checkSectorCorrelation(holdings: HoldingPosition[]): string[] {
  const sectorCounts: Record<string, string[]> = {};

  for (const h of holdings) {
    if (!sectorCounts[h.sector]) sectorCounts[h.sector] = [];
    sectorCounts[h.sector].push(h.symbol);
  }

  const warnings: string[] = [];
  for (const [sector, symbols] of Object.entries(sectorCounts)) {
    if (symbols.length >= 2) {
      warnings.push(`Concentrated Sector Bet: You hold ${symbols.length} positions in ${sector} (${symbols.join(', ')}).`);
    }
  }

  return warnings;
}
