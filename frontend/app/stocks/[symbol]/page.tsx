'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { DEMO_STOCKS } from '@/lib/data';

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
  return (
    AI_DATA[symbol] || {
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
    }
  );
}

export default function StockAnalysisPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();
  const stock = DEMO_STOCKS.find((s) => s.symbol === symbol) || DEMO_STOCKS[0];
  const ai = getAI(symbol);
  const isUp = stock.change_pct >= 0;
  const [watchlisted, setWatchlisted] = useState(false);

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
                  <span className="text-display font-semibold text-emerald-600 dark:text-emerald-400">
                    {ai.signal}
                  </span>
                  <Badge variant="emerald" size="md">
                    {ai.confidence}% Confidence
                  </Badge>
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

          {/* Model Breakdown Panel */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Model Consensus Breakdown
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              {ai.models.map((m: any) => (
                <div key={m.name} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{m.name}</span>
                  <div className="flex items-center space-x-3">
                    <span className="text-slate-500">{m.conf}%</span>
                    <Badge variant={m.signal.toLowerCase() as any} size="sm">
                      {m.signal}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
