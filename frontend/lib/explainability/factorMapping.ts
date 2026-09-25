export interface FactorItem {
  factor_name: string;
  direction: 'supports' | 'contradicts';
  weight_pct: number;
  plain_language: string;
}

export interface ModelVote {
  model_name: 'XGBoost' | 'LightGBM' | 'NeuralNet' | 'Prophet';
  vote: 'BUY' | 'SELL' | 'HOLD';
  confidence_pct: number;
  disagreement_flag?: boolean;
  top_factors: FactorItem[];
}

export const FEATURE_TEMPLATES: Record<
  string,
  { name: string; template: (val: number, direction: 'supports' | 'contradicts') => string }
> = {
  rsi_14: {
    name: 'RSI Momentum',
    template: (val, dir) =>
      dir === 'supports'
        ? `RSI at ${val.toFixed(1)} in bullish expansion zone`
        : `RSI at ${val.toFixed(1)} showing overbought deceleration`,
  },
  macd_hist: {
    name: 'MACD Trend Crossover',
    template: (val, dir) =>
      dir === 'supports'
        ? `MACD histogram positive divergence (+${val.toFixed(2)})`
        : `MACD histogram weakening (-${Math.abs(val).toFixed(2)})`,
  },
  volume_surge: {
    name: 'Volume Surge',
    template: (val, dir) =>
      dir === 'supports'
        ? `Trading volume ${val.toFixed(1)}x above 20-day moving average`
        : `Trading volume contracting below 20-day average`,
  },
  fii_flow: {
    name: 'Institutional Money Flow',
    template: (val, dir) =>
      dir === 'supports'
        ? `Institutional net buying inflows of ₹${val.toFixed(0)} Cr`
        : `Institutional profit-taking outflows of ₹${Math.abs(val).toFixed(0)} Cr`,
  },
  trend_comp: {
    name: 'Long-Term Trend Vector',
    template: (val, dir) =>
      dir === 'supports'
        ? `Primary price trajectory trending upward at +${val.toFixed(1)}% slope`
        : `Primary price trajectory flattening downward`,
  },
  seasonality_comp: {
    name: 'Seasonal Cycle',
    template: (val, dir) =>
      dir === 'supports'
        ? `Historical seasonality cycle favours bullish monthly performance`
        : `Historical seasonal cycle indicates quarterly consolidation phase`,
  },
  residual_comp: {
    name: 'Recent Price Residuals',
    template: (val, dir) =>
      dir === 'supports'
        ? `Short-term mean-reversion pullbacks supporting entry`
        : `Recent residual volatility diverging from baseline trend`,
  },
  occlusion_delta: {
    name: 'Neural Feature Sensitivity',
    template: (val, dir) =>
      dir === 'supports'
        ? `High layer activation response on momentum feature set (${val.toFixed(1)}% sensitivity)`
        : `Feature occlusion test reveals conflicting hidden layer weights`,
  },
};
