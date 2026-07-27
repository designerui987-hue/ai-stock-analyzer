'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Target,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Newspaper,
  Layers,
  Calculator,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  ShoppingBag,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { DEMO_STOCKS } from '@/lib/data';
import { getOptionChainSummary } from '@/lib/optionChain';
import { calculatePositionSize } from '@/lib/positionSizing';
import {
  extractXGBoostFactors,
  extractLightGBMFactors,
  extractNeuralNetFactors,
  extractProphetFactors,
  generateConsensusSummary,
} from '@/lib/explainability/extractFactors';
import { FactorItem, ModelVote } from '@/lib/explainability/factorMapping';

const AI_DATA: Record<string, any> = {
  RELIANCE: {
    signal: 'BUY',
    confidence: 84,
    risk: 'Low',
    riskScore: 3.2,
    entry: 2450,
    target: 2780,
    stopLoss: 2310,
    upside: 13.4,
    profitProb: 78,
    reasons: [
      'Strong earnings growth: 18% YoY profit increase last quarter',
      'Bullish MACD crossover with rising volume momentum',
      'Green energy investments create new long-term revenue catalyst',
      'Price holding above 200-day SMA — structural uptrend intact',
    ],
    pe: 26.8,
    rsi: 58.4,
    macd: 2.34,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 88 },
      { name: 'LightGBM', signal: 'BUY', conf: 82 },
      { name: 'Neural Net', signal: 'BUY', conf: 79 },
      { name: 'Prophet', signal: 'HOLD', conf: 61 },
    ],
  },
  TCS: {
    signal: 'HOLD',
    confidence: 63,
    risk: 'Medium',
    riskScore: 4.1,
    entry: 3800,
    target: 4150,
    stopLoss: 3640,
    upside: 6.6,
    profitProb: 58,
    reasons: [
      'Revenue growth moderating amid global IT spending slowdown',
      'P/E ratio of 32x slightly elevated vs. earnings guidance',
      'Strong deal pipeline but execution timing uncertainty remains',
      'Price consolidating in tight range — wait for clear breakout',
    ],
    pe: 32.1,
    rsi: 52.1,
    macd: -1.23,
    models: [
      { name: 'XGBoost', signal: 'HOLD', conf: 70 },
      { name: 'LightGBM', signal: 'BUY', conf: 54 },
      { name: 'Neural Net', signal: 'HOLD', conf: 65 },
      { name: 'Prophet', signal: 'HOLD', conf: 62 },
    ],
  },
  HDFCBANK: {
    signal: 'BUY',
    confidence: 79,
    risk: 'Low',
    riskScore: 2.7,
    entry: 1620,
    target: 1870,
    stopLoss: 1545,
    upside: 13.6,
    profitProb: 73,
    reasons: [
      'NIM expansion expected from anticipated RBI rate cuts',
      'Loan book growing at 18% with improving asset quality',
      'RSI at 61 — bullish momentum without overbought conditions',
      'Consistent institutional FII accumulation over last 10 sessions',
    ],
    pe: 19.5,
    rsi: 61.2,
    macd: 3.45,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 82 },
      { name: 'LightGBM', signal: 'BUY', conf: 78 },
      { name: 'Neural Net', signal: 'BUY', conf: 75 },
      { name: 'Prophet', signal: 'HOLD', conf: 58 },
    ],
  },
};

function getAI(symbol: string) {
  const raw = AI_DATA[symbol] || {
    signal: 'BUY',
    confidence: 74,
    risk: 'Medium',
    riskScore: 3.8,
    entry: 850,
    target: 980,
    stopLoss: 810,
    upside: 14.2,
    profitProb: 70,
    reasons: [
      'Positive momentum across sector technical indicators',
      'Improving quarterly fundamentals and balance sheet strength',
      'Institutional volume breakout detected on 14-day average',
    ],
    pe: 24.5,
    rsi: 56.0,
    macd: 1.8,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 78 },
      { name: 'LightGBM', signal: 'BUY', conf: 74 },
      { name: 'Neural Net', signal: 'HOLD', conf: 62 },
      { name: 'Prophet', signal: 'BUY', conf: 68 },
    ],
  };

  // Convert models to enriched ModelVote structures
  const modelVotes: ModelVote[] = raw.models.map((m: any) => {
    let factors: FactorItem[] = [];

    if (m.name === 'XGBoost') {
      factors = extractXGBoostFactors([
        { feature: 'rsi_14', weight: 42, value: raw.rsi, is_positive: m.signal === 'BUY' },
        { feature: 'fii_flow', weight: 32, value: 1450, is_positive: m.signal === 'BUY' },
        { feature: 'volume_surge', weight: 26, value: 2.1, is_positive: true },
      ]);
    } else if (m.name === 'LightGBM') {
      factors = extractLightGBMFactors([
        { feature: 'macd_hist', gain_pct: 45, value: raw.macd, is_positive: m.signal === 'BUY' },
        { feature: 'rsi_14', gain_pct: 35, value: raw.rsi, is_positive: m.signal === 'BUY' },
        { feature: 'fii_flow', gain_pct: 20, value: 1100, is_positive: true },
      ]);
    } else if (m.name === 'NeuralNet') {
      factors = extractNeuralNetFactors([
        { feature: 'occlusion_delta', confidence_delta: 18, value: 84.5, supports_vote: m.signal === raw.signal },
        { feature: 'rsi_14', confidence_delta: 12, value: raw.rsi, supports_vote: m.signal === raw.signal },
        { feature: 'volume_surge', confidence_delta: -5, value: 1.2, supports_vote: false },
      ]);
    } else {
      factors = extractProphetFactors({
        trend_slope: m.signal === 'BUY' ? 2.4 : -0.8,
        seasonality_effect: m.signal === 'BUY' ? 1.5 : -1.8,
        residual_impact: -0.5,
        vote: m.signal,
      });
    }

    return {
      model_name: m.name as any,
      vote: m.signal,
      confidence_pct: m.conf,
      top_factors: factors,
    };
  });

  const summary = generateConsensusSummary(modelVotes);

  return {
    ...raw,
    model_votes: modelVotes,
    consensus_summary: summary,
  };
}

export default function StockAnalysisPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();
  const stock = DEMO_STOCKS.find((s) => s.symbol === symbol) || DEMO_STOCKS[0];
  const ai = getAI(symbol);
  const isUp = stock.change_pct >= 0;
  const [watchlisted, setWatchlisted] = useState(false);

  // Position Sizing Calculator State (defaults to 11,83,500 capital & 1% risk)
  const [calcCapital, setCalcCapital] = useState<number>(1183500);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.0);

  const sizingResult = calculatePositionSize({
    account_capital: calcCapital,
    risk_pct: calcRiskPct,
    entry_price: ai.entry,
    stop_loss_price: ai.stopLoss,
    target_price: ai.target,
    symbol: stock.symbol,
  });

  // State for expanding explainability model cards
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set(['XGBoost']));

  const toggleModelExpand = (name: string) => {
    const next = new Set(expandedModels);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedModels(next);
  };

  // Broker Connection & Order Placement Modal State
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderProductType, setOrderProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/broker/connection?userId=demo_user')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.connected) {
          setBrokerConnected(true);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleExecuteOrder = async () => {
    setOrderSubmitting(true);
    setOrderError(null);
    setOrderSuccessMsg(null);

    try {
      const res = await fetch('/api/broker/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo_user',
          symbol: stock.symbol,
          transaction_type: ai.signal === 'BUY' ? 'BUY' : 'SELL',
          quantity: sizingResult.position_size_shares,
          order_type: orderType,
          product_type: orderProductType,
          price: ai.entry,
          stop_loss_price: ai.stopLoss,
          target_price: ai.target,
          user_confirmed: true,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setOrderError(data.error || 'Order placement failed');
      } else {
        setOrderSuccessMsg(`✅ Order #${data.order.broker_order_id} placed successfully with Zerodha Kite!`);
        setTimeout(() => {
          setIsOrderModalOpen(false);
          setOrderSuccessMsg(null);
        }, 2000);
      }
    } catch (e: any) {
      setOrderError(e.message || 'Network error executing order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const CHART_DATA = [
    { time: 'May', value: stock.price * 0.88 },
    { time: 'Jun', value: stock.price * 0.92 },
    { time: 'Jul 1', value: stock.price * 0.95 },
    { time: 'Jul 10', value: stock.price * 0.94 },
    { time: 'Jul 18', value: stock.price * 0.98 },
    { time: 'Jul 22', value: stock.price },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header Card */}
      <Card size="large" className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
              {stock.symbol}
            </h1>
            <Badge variant={ai.signal.toLowerCase() as any} size="md">
              AI {ai.signal}
            </Badge>
            <span className="text-caption text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              NSE Live
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {stock.name} · {stock.sector} · Market Cap: {stock.market_cap}
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-h1 font-semibold text-slate-900 dark:text-slate-100">
              ₹{stock.price.toLocaleString('en-IN')}
            </div>
            <div
              className={`text-caption font-medium mt-0.5 ${
                isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isUp ? '+' : ''}
              {stock.change_pct.toFixed(2)}% Today
            </div>
          </div>

          <Button
            variant={watchlisted ? 'secondary' : 'outline'}
            size="md"
            icon={<Bookmark className={`w-4 h-4 ${watchlisted ? 'fill-current' : ''}`} />}
            onClick={() => setWatchlisted(!watchlisted)}
          >
            {watchlisted ? 'Watchlisted' : 'Add to Watchlist'}
          </Button>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pt-2 pb-3">
          <Link
            href={`/stocks/${stock.symbol}`}
            className="px-4 py-2 rounded-btn text-xs font-semibold bg-indigo-600 text-white shadow-subtle"
          >
            Overview & Technicals
          </Link>
          <Link
            href={`/stocks/${stock.symbol}/options`}
            className="px-4 py-2 rounded-btn text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" /> Options Chain & F&O
          </Link>
        </div>
      </Card>

      {/* Ticker Quick Navigation Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {DEMO_STOCKS.map((s) => (
          <Link
            key={s.symbol}
            href={`/stocks/${s.symbol}`}
            className={`px-3 py-1.5 rounded-btn text-xs font-medium shrink-0 transition-colors ${
              s.symbol === symbol
                ? 'bg-indigo-600 text-white shadow-subtle'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {s.symbol}
          </Link>
        ))}
      </div>

      {/* Main Grid: Financial Chart & AI Recommendation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Financial Chart & Fundamental Metrics */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Financial Chart Container */}
          <Card size="large" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Technical Price Structure & Moving Averages
              </h3>
              <Badge variant="indigo" size="sm">
                RSI: {ai.rsi} (Neutral-Bullish)
              </Badge>
            </div>

            <FinancialChart data={CHART_DATA} height={340} isPositive={isUp} showTimeRange={true} />
          </Card>

          {/* Financial Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <span className="text-caption text-slate-500 font-medium">P/E Ratio</span>
              <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-2">
                {ai.pe}x
              </p>
              <span className="text-caption text-slate-400">Sector Avg: 28.2x</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">RSI (14-Day)</span>
              <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-2">
                {ai.rsi}
              </p>
              <span className="text-caption text-emerald-500">Bullish Zone</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">MACD (12, 26)</span>
              <p className="text-h3 font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
                +{ai.macd}
              </p>
              <span className="text-caption text-slate-400">Positive Crossover</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">Historical Accuracy</span>
              <p className="text-h3 font-semibold text-indigo-600 dark:text-indigo-400 mt-2">
                76.4%
              </p>
              <span className="text-caption text-slate-400">90-Day Backtest</span>
            </Card>
          </div>
        </div>

        {/* Right Column: AI Decision Panel & Action Plan */}
        <div className="space-y-6">
          {/* Main AI Decision Card */}
          <Card size="large" className="space-y-6 border-indigo-500/30">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-4">
              <div>
                <p className="text-caption text-slate-500 uppercase tracking-wider font-medium">
                  Ensemble AI Signal
                </p>
                <div className="flex items-baseline space-x-3 mt-1">
                  <span
                    className={`text-display font-semibold ${
                      ai.signal === 'BUY'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : ai.signal === 'SELL'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {ai.signal}
                  </span>
                  <Badge variant={ai.signal.toLowerCase() as any} size="md">
                    {ai.confidence}% Confidence
                  </Badge>
                </div>
                {/* Integrated Options Positioning Tag */}
                <div className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded inline-flex items-center gap-1.5 border border-indigo-500/20">
                  <Layers className="w-3 h-3" />
                  <span>
                    Options positioning: {getOptionChainSummary(stock.symbol, stock.price).summary.pcr_signal} (PCR {getOptionChainSummary(stock.symbol, stock.price).summary.pcr}, Max Pain ₹{getOptionChainSummary(stock.symbol, stock.price).summary.max_pain})
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-caption text-slate-500">Risk Assessment</span>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {ai.risk} ({ai.riskScore}/10)
                </p>
              </div>
            </div>

            {/* Action Plan Grid */}
            <div className="space-y-2">
              <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
                Action Plan & Target Levels
              </span>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06] text-center">
                  <span className="text-caption text-slate-500">Entry</span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    ₹{ai.entry}
                  </p>
                </div>

                <div className="p-3 rounded-btn bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-caption text-emerald-600 dark:text-emerald-400">
                    Target
                  </span>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    ₹{ai.target}
                  </p>
                </div>

                <div className="p-3 rounded-btn bg-red-500/10 border border-red-500/20 text-center">
                  <span className="text-caption text-red-600 dark:text-red-400">Stop Loss</span>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-1">
                    ₹{ai.stopLoss}
                  </p>
                </div>
              </div>
            </div>

            {/* Position Size Calculator Card */}
            <div className="p-4 rounded-card bg-slate-50/80 dark:bg-slate-900/70 border border-indigo-500/20 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-2.5">
                <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-wider">
                  <Calculator className="w-4 h-4" />
                  <span>Position Size Calculator</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">1% Risk Rule Engine</span>
              </div>

              {/* Inline Editable Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Trading Capital (₹)</label>
                  <input
                    type="number"
                    value={calcCapital}
                    onChange={(e) => setCalcCapital(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Risk / Trade (%)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={calcRiskPct}
                    onChange={(e) => setCalcRiskPct(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Calculation Output Results */}
              {sizingResult.error ? (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{sizingResult.error}</span>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-white dark:bg-slate-800/80 rounded border border-slate-200 dark:border-white/[0.05]">
                    <div>
                      <span className="text-[10px] text-slate-500">Rec. Quantity</span>
                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400" suppressHydrationWarning>
                        {sizingResult.position_size_shares.toLocaleString()} Shares
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ({sizingResult.position_size_lots} Lots · {sizingResult.lot_size}/lot)
                        </span>
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500">Max Risk Amount</span>
                      <p className="text-sm font-bold text-red-600 dark:text-red-400" suppressHydrationWarning>
                        ₹{sizingResult.max_risk_amount.toLocaleString()}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          (₹{sizingResult.risk_per_share}/share)
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-500">Risk:Reward Ratio:</span>
                      <span
                        className={`font-bold ${
                          sizingResult.rr_quality === 'EXCELLENT'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sizingResult.rr_quality === 'GOOD'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        1 : {sizingResult.risk_reward_ratio}
                      </span>
                      <Badge
                        variant={
                          sizingResult.rr_quality === 'EXCELLENT'
                            ? 'emerald'
                            : sizingResult.rr_quality === 'GOOD'
                            ? 'amber'
                            : 'red'
                        }
                        size="sm"
                      >
                        {sizingResult.rr_quality === 'EXCELLENT'
                          ? 'Favorable (≥1:2)'
                          : sizingResult.rr_quality === 'GOOD'
                          ? 'Acceptable'
                          : 'Poor R:R'}
                      </Badge>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500">Portfolio Value:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-1">
                        {sizingResult.position_value_pct}%
                      </span>
                    </div>
                  </div>

                  {sizingResult.is_concentration_breached && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-700 dark:text-amber-300 font-medium" suppressHydrationWarning>
                      ⚠️ Position value (₹{sizingResult.position_value.toLocaleString()}) exceeds max concentration limit ({sizingResult.max_concentration_pct}% of capital).
                    </div>
                  )}

                  {/* Broker Order Placement Trigger Button */}
                  <div className="pt-2">
                    {brokerConnected ? (
                      <Button
                        variant={ai.signal === 'BUY' ? 'primary' : 'secondary'}
                        size="md"
                        onClick={() => setIsOrderModalOpen(true)}
                        className={`w-full justify-center text-xs font-semibold ${
                          ai.signal === 'BUY' ? '!bg-emerald-600 hover:!bg-emerald-700' : '!bg-red-600 hover:!bg-red-700 !text-white'
                        }`}
                      >
                        ⚡ Place {ai.signal} Order with Zerodha ({sizingResult.position_size_shares} Shares)
                      </Button>
                    ) : (
                      <Link href="/settings" className="block w-full">
                        <Button variant="secondary" size="md" className="w-full justify-center text-xs">
                          🔗 Connect Zerodha Kite to Trade
                        </Button>
                      </Link>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                    Formula: <code>floor(Risk ₹ / Risk-per-share ₹)</code> · Verify F&O lot sizes with broker.
                  </div>
                </div>
              )}
            </div>

            {/* Order Confirmation Modal */}
            {isOrderModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] pb-3">
                    <div className="flex items-center space-x-2">
                      <ShoppingBag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Confirm Broker Order Placement
                      </h3>
                    </div>
                    <button
                      onClick={() => setIsOrderModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Order Summary Grid */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-card border border-slate-200/60 dark:border-white/[0.05] text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Symbol</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{stock.symbol}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Transaction</span>
                      <Badge variant={ai.signal === 'BUY' ? 'emerald' : 'red'} size="sm">
                        {ai.signal}
                      </Badge>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Quantity</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        {sizingResult.position_size_shares} Shares ({sizingResult.position_size_lots} Lots)
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Estimated Price</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        ₹{ai.entry.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Est. Position Value</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        ₹{sizingResult.position_value.toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Calculated Risk</span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        ₹{sizingResult.max_risk_amount.toLocaleString()} ({sizingResult.risk_pct_of_capital}%)
                      </span>
                    </div>
                  </div>

                  {/* Product & Order Type Selectors */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-slate-500 font-medium block mb-1">
                        Product Type (Execution):
                      </label>
                      <select
                        value={orderProductType}
                        onChange={(e) => setOrderProductType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="CNC">CNC (Equity Cash Delivery)</option>
                        <option value="MIS">MIS (Intraday Leverage)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-500 font-medium block mb-1">
                        Order Type:
                      </label>
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="MARKET">MARKET Order</option>
                        <option value="LIMIT">LIMIT Order (₹{ai.entry})</option>
                      </select>
                    </div>
                  </div>

                  {/* Warning & SEBI Disclaimer */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-card text-[11px] text-amber-900 dark:text-amber-200 leading-normal space-y-1">
                    <p className="font-bold">⚠️ Real Money Execution Warning:</p>
                    <p>
                      This action will place a real order with Zerodha Kite Connect. Orders are executed at your sole discretion. Past AI performance does not guarantee future results.
                    </p>
                  </div>

                  {/* Error / Success Feedback */}
                  {orderError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400 font-medium">
                      ❌ {orderError}
                    </div>
                  )}

                  {orderSuccessMsg && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      {orderSuccessMsg}
                    </div>
                  )}

                  {/* Modal Action Buttons */}
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setIsOrderModalOpen(false)}
                      disabled={orderSubmitting}
                    >
                      Cancel
                    </Button>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleExecuteOrder}
                      disabled={orderSubmitting}
                      className={ai.signal === 'BUY' ? '!bg-emerald-600 hover:!bg-emerald-700' : '!bg-red-600 hover:!bg-red-700'}
                    >
                      {orderSubmitting ? 'Submitting to Kite...' : `Confirm & Place ${ai.signal} Order`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Key Catalysts & Reasons */}
            <div className="space-y-3">
              <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
                Key AI Catalysts
              </span>
              <div className="space-y-2">
                {ai.reasons.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Model Breakdown & Explainability Panel */}
          <Card className="space-y-5 border-indigo-500/30">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Model Consensus Explainability
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Click to inspect factors</span>
            </div>

            {/* Synthesized Rule-Based Consensus Summary Banner */}
            <div className="p-3 rounded bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed font-medium">
              💡 {ai.consensus_summary}
            </div>

            {/* Expandable Model Cards */}
            <div className="space-y-3">
              {ai.model_votes.map((m: ModelVote) => {
                const isExpanded = expandedModels.has(m.model_name);

                return (
                  <div
                    key={m.model_name}
                    className="rounded-btn border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/60 overflow-hidden transition-colors"
                  >
                    <div
                      onClick={() => toggleModelExpand(m.model_name)}
                      className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 dark:hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {m.model_name}
                        </span>
                        <Badge variant={m.vote.toLowerCase() as any} size="sm">
                          {m.vote}
                        </Badge>
                        {m.disagreement_flag && (
                          <Badge variant="amber" size="sm">
                            Diverges from consensus
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-xs">
                        <span className="text-slate-500 font-mono">{m.confidence_pct}% Conf</span>
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* Expanded Factors Panel */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 dark:border-white/[0.04] bg-white dark:bg-slate-900/90 space-y-2.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Top Factors Driving Prediction ({m.model_name === 'NeuralNet' ? 'Occlusion Proxy' : m.model_name === 'Prophet' ? 'Decomposition' : 'Feature Importance'})
                        </span>

                        <div className="space-y-2">
                          {m.top_factors.map((f, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center space-x-1.5 font-medium">
                                  {f.direction === 'supports' ? (
                                    <span className="text-emerald-500 font-bold text-sm">↑</span>
                                  ) : (
                                    <span className="text-red-500 font-bold text-sm">↓</span>
                                  )}
                                  <span className="text-slate-800 dark:text-slate-200">{f.factor_name}</span>
                                </div>
                                <span className="font-mono text-[11px] text-slate-500">{f.weight_pct}% weight</span>
                              </div>

                              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    f.direction === 'supports' ? 'bg-emerald-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${f.weight_pct}%` }}
                                />
                              </div>

                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                                {f.plain_language}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
