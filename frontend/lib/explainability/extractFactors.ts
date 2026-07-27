import { FEATURE_TEMPLATES } from './factorMapping.ts';
import type { FactorItem, ModelVote } from './factorMapping.ts';

/**
 * 1. Tree-based Models (XGBoost): Feature Importances / SHAP Mapping
 */
export function extractXGBoostFactors(
  importances: { feature: string; weight: number; value: number; is_positive: boolean }[]
): FactorItem[] {
  const sorted = [...importances].sort((a, b) => b.weight - a.weight).slice(0, 4);

  return sorted.map((imp) => {
    const tmpl = FEATURE_TEMPLATES[imp.feature] || {
      name: imp.feature.toUpperCase(),
      template: (v, d) => `${imp.feature} weighted contribution (${v.toFixed(1)})`,
    };

    const direction = imp.is_positive ? 'supports' : 'contradicts';
    return {
      factor_name: tmpl.name,
      direction,
      weight_pct: Math.round(imp.weight),
      plain_language: tmpl.template(imp.value, direction),
    };
  });
}

/**
 * 2. Tree-based Models (LightGBM): Gain Importances Mapping
 */
export function extractLightGBMFactors(
  gains: { feature: string; gain_pct: number; value: number; is_positive: boolean }[]
): FactorItem[] {
  const sorted = [...gains].sort((a, b) => b.gain_pct - a.gain_pct).slice(0, 4);

  return sorted.map((g) => {
    const tmpl = FEATURE_TEMPLATES[g.feature] || {
      name: g.feature.toUpperCase(),
      template: (v, d) => `${g.feature} split gain (${v.toFixed(1)})`,
    };

    const direction = g.is_positive ? 'supports' : 'contradicts';
    return {
      factor_name: tmpl.name,
      direction,
      weight_pct: Math.round(g.gain_pct),
      plain_language: tmpl.template(g.value, direction),
    };
  });
}

/**
 * 3. Deep Learning (NeuralNet): Feature Occlusion Importance Proxy
 * Note: Occlusion measures prediction confidence delta when each input feature set is zeroed/masked.
 */
export function extractNeuralNetFactors(
  occlusions: { feature: string; confidence_delta: number; value: number; supports_vote: boolean }[]
): FactorItem[] {
  const sorted = [...occlusions].sort((a, b) => Math.abs(b.confidence_delta) - Math.abs(a.confidence_delta)).slice(0, 4);
  const totalDelta = sorted.reduce((sum, o) => sum + Math.abs(o.confidence_delta), 0) || 1;

  return sorted.map((occ) => {
    const tmpl = FEATURE_TEMPLATES[occ.feature] || {
      name: occ.feature.toUpperCase(),
      template: (v, d) => `${occ.feature} layer sensitivity (${v.toFixed(1)})`,
    };

    const weightPct = Math.round((Math.abs(occ.confidence_delta) / totalDelta) * 100);
    const direction = occ.supports_vote ? 'supports' : 'contradicts';

    return {
      factor_name: tmpl.name,
      direction,
      weight_pct: weightPct,
      plain_language: tmpl.template(occ.value, direction),
    };
  });
}

/**
 * 4. Time Series (Prophet): Trend vs Seasonality vs Residual Decomposition
 */
export function extractProphetFactors(
  components: {
    trend_slope: number;
    seasonality_effect: number;
    residual_impact: number;
    vote: 'BUY' | 'SELL' | 'HOLD';
  }
): FactorItem[] {
  const { trend_slope, seasonality_effect, residual_impact, vote } = components;

  const trendDir: 'supports' | 'contradicts' = (vote === 'BUY' && trend_slope > 0) || (vote === 'SELL' && trend_slope < 0) ? 'supports' : 'contradicts';
  const seasonDir: 'supports' | 'contradicts' = (vote === 'BUY' && seasonality_effect > 0) || (vote === 'SELL' && seasonality_effect < 0) ? 'supports' : 'contradicts';
  const resDir: 'supports' | 'contradicts' = (vote === 'BUY' && residual_impact > 0) || (vote === 'SELL' && residual_impact < 0) ? 'supports' : 'contradicts';

  return [
    {
      factor_name: FEATURE_TEMPLATES.trend_comp.name,
      direction: trendDir,
      weight_pct: 45,
      plain_language: FEATURE_TEMPLATES.trend_comp.template(Math.abs(trend_slope * 10), trendDir),
    },
    {
      factor_name: FEATURE_TEMPLATES.seasonality_comp.name,
      direction: seasonDir,
      weight_pct: 35,
      plain_language: FEATURE_TEMPLATES.seasonality_comp.template(Math.abs(seasonality_effect * 10), seasonDir),
    },
    {
      factor_name: FEATURE_TEMPLATES.residual_comp.name,
      direction: resDir,
      weight_pct: 20,
      plain_language: FEATURE_TEMPLATES.residual_comp.template(Math.abs(residual_impact * 10), resDir),
    },
  ];
}

/**
 * Rule-Based Ensemble Consensus Synthesizer
 * Generates a fast, deterministic single-sentence summary explaining majority vote drivers and dissents.
 */
export function generateConsensusSummary(votes: ModelVote[]): string {
  if (!votes || votes.length === 0) return 'Model consensus is being evaluated.';

  // Count votes
  const counts: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  votes.forEach((v) => {
    counts[v.vote] = (counts[v.vote] || 0) + 1;
  });

  // Find majority vote
  let majorityVote: 'BUY' | 'SELL' | 'HOLD' = 'BUY';
  let maxCount = 0;

  for (const [vote, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      majorityVote = vote as any;
    }
  }

  const agreeingModels = votes.filter((v) => v.vote === majorityVote);
  const dissentingModels = votes.filter((v) => v.vote !== majorityVote);

  // Mark disagreement_flag on dissenting models
  votes.forEach((v) => {
    v.disagreement_flag = v.vote !== majorityVote;
  });

  // Find most common top factor among agreeing models
  const factorCounts: Record<string, number> = {};
  agreeingModels.forEach((m) => {
    if (m.top_factors && m.top_factors.length > 0) {
      const topName = m.top_factors[0].factor_name;
      factorCounts[topName] = (factorCounts[topName] || 0) + 1;
    }
  });

  let keyDriver = 'momentum and technical indicators';
  let topFactorCount = 0;
  for (const [name, count] of Object.entries(factorCounts)) {
    if (count > topFactorCount) {
      topFactorCount = count;
      keyDriver = name.toLowerCase();
    }
  }

  const totalModels = votes.length;
  let sentence = `${maxCount} of ${totalModels} models agree (${majorityVote}) — driven mainly by ${keyDriver}.`;

  if (dissentingModels.length > 0) {
    const dissenter = dissentingModels[0];
    const dissenterFactor = dissenter.top_factors[0]?.factor_name.toLowerCase() || 'different market factors';
    sentence += ` ${dissenter.model_name} dissents (${dissenter.vote}), citing ${dissenterFactor}.`;
  } else {
    sentence += ' Full model alignment across all architecture families.';
  }

  return sentence;
}
