import assert from 'node:assert';
import {
  extractXGBoostFactors,
  extractLightGBMFactors,
  extractNeuralNetFactors,
  extractProphetFactors,
  generateConsensusSummary,
} from './extractFactors.ts';
import type { ModelVote } from './factorMapping.ts';

console.log('Running Explainability Factor Extraction Tests...');

// Test 1: XGBoost Feature Importance Extraction
{
  const importances = [
    { feature: 'rsi_14', weight: 40, value: 62.5, is_positive: true },
    { feature: 'volume_surge', weight: 35, value: 2.1, is_positive: true },
    { feature: 'fii_flow', weight: 25, value: 1200, is_positive: true },
  ];

  const factors = extractXGBoostFactors(importances);
  assert.strictEqual(factors.length, 3);
  assert.strictEqual(factors[0].factor_name, 'RSI Momentum');
  assert.strictEqual(factors[0].weight_pct, 40);
  assert.strictEqual(factors[0].direction, 'supports');
  assert.ok(factors[0].plain_language.includes('RSI at 62.5'));

  console.log('  ✓ XGBoost feature importance extraction test passed');
}

// Test 2: LightGBM Gain Importance Extraction
{
  const gains = [
    { feature: 'macd_hist', gain_pct: 50, value: 4.2, is_positive: true },
    { feature: 'volume_surge', gain_pct: 30, value: 1.8, is_positive: true },
  ];

  const factors = extractLightGBMFactors(gains);
  assert.strictEqual(factors[0].factor_name, 'MACD Trend Crossover');
  assert.strictEqual(factors[0].weight_pct, 50);

  console.log('  ✓ LightGBM gain importance extraction test passed');
}

// Test 3: NeuralNet Occlusion Proxy Extraction
{
  const occlusions = [
    { feature: 'rsi_14', confidence_delta: -15, value: 64, supports_vote: true },
    { feature: 'fii_flow', confidence_delta: -5, value: 800, supports_vote: true },
  ];

  const factors = extractNeuralNetFactors(occlusions);
  assert.strictEqual(factors.length, 2);
  // Total delta = 20. rsi_14 weight = 15/20 = 75%
  assert.strictEqual(factors[0].weight_pct, 75);
  assert.strictEqual(factors[0].direction, 'supports');

  console.log('  ✓ NeuralNet occlusion proxy extraction test passed');
}

// Test 4: Prophet Decomposition Extraction
{
  const components = {
    trend_slope: 2.5,
    seasonality_effect: 1.2,
    residual_impact: -0.4,
    vote: 'BUY' as const,
  };

  const factors = extractProphetFactors(components);
  assert.strictEqual(factors.length, 3);
  assert.strictEqual(factors[0].factor_name, 'Long-Term Trend Vector');
  assert.strictEqual(factors[0].direction, 'supports');
  assert.strictEqual(factors[2].factor_name, 'Recent Price Residuals');
  assert.strictEqual(factors[2].direction, 'contradicts');

  console.log('  ✓ Prophet component decomposition test passed');
}

// Test 5: Consensus Summary Synthesizer
{
  const votes: ModelVote[] = [
    {
      model_name: 'XGBoost',
      vote: 'BUY',
      confidence_pct: 88,
      top_factors: [
        { factor_name: 'RSI Momentum', direction: 'supports', weight_pct: 40, plain_language: 'RSI bullish' },
      ],
    },
    {
      model_name: 'LightGBM',
      vote: 'BUY',
      confidence_pct: 84,
      top_factors: [
        { factor_name: 'RSI Momentum', direction: 'supports', weight_pct: 45, plain_language: 'RSI bullish' },
      ],
    },
    {
      model_name: 'NeuralNet',
      vote: 'BUY',
      confidence_pct: 82,
      top_factors: [
        { factor_name: 'Volume Surge', direction: 'supports', weight_pct: 35, plain_language: 'Volume surge' },
      ],
    },
    {
      model_name: 'Prophet',
      vote: 'HOLD',
      confidence_pct: 61,
      top_factors: [
        { factor_name: 'Seasonal Cycle', direction: 'contradicts', weight_pct: 50, plain_language: 'Seasonal lag' },
      ],
    },
  ];

  const summary = generateConsensusSummary(votes);
  assert.ok(summary.includes('3 of 4 models agree (BUY)'));
  assert.ok(summary.includes('rsi momentum'));
  assert.ok(summary.includes('Prophet dissents (HOLD)'));
  assert.strictEqual(votes[3].disagreement_flag, true);
  assert.strictEqual(votes[0].disagreement_flag, false);

  console.log('  ✓ Consensus summary synthesis test passed');
}

console.log('✅ All Explainability Factor Extraction Tests Passed Successfully!');
