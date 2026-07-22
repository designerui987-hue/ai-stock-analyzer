'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Activity,
  Award,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { Sparkline } from '@/components/ui/Sparkline';
import {
  DEMO_INDICES,
  DEMO_STOCKS,
  DEMO_AI_PICKS,
  DEMO_PORTFOLIO,
  DEMO_ALERTS,
} from '@/lib/data';

const CHART_DATA = [
  { time: 'Jul 1', value: 2420000 },
  { time: 'Jul 5', value: 2435000 },
  { time: 'Jul 10', value: 2410000 },
  { time: 'Jul 15', value: 2460000 },
  { time: 'Jul 18', value: 2485000 },
  { time: 'Jul 20', value: 2470000 },
  { time: 'Jul 22', value: 2514200 },
];

export default function DashboardPage() {
  const pnlPositive = DEMO_PORTFOLIO.total_pnl >= 0;
  const sorted = [...DEMO_STOCKS].sort((a, b) => b.change_pct - a.change_pct);
  const gainers = sorted.slice(0, 4);
  const losers = sorted.slice(-4).reverse();

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Hero Section: Main Portfolio Analytics & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Performance Chart & Balance Hero */}
        <Card size="large" className="lg:col-span-2 flex flex-col justify-between space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-caption text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                Total Portfolio Balance
              </p>
              <div className="flex items-baseline space-x-3 mt-1">
                <h2 className="text-display font-semibold text-slate-900 dark:text-slate-100">
                  ₹{(DEMO_PORTFOLIO.current_value / 100000).toFixed(2)} Lakhs
                </h2>
                <Badge variant={pnlPositive ? 'emerald' : 'red'} size="md">
                  {pnlPositive ? '+' : ''}
                  {DEMO_PORTFOLIO.total_pnl_pct}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Link href="/portfolio">
                <Button variant="outline" size="sm">
                  View Holdings
                </Button>
              </Link>
              <Link href="/assistant">
                <Button variant="primary" size="sm" icon={<Sparkles className="w-3.5 h-3.5" />}>
                  Rebalance AI
                </Button>
              </Link>
            </div>
          </div>

          <FinancialChart
            data={CHART_DATA}
            height={260}
            isPositive={pnlPositive}
            showTimeRange={true}
          />
        </Card>

        {/* High Priority KPI Grid & Sentiment */}
        <div className="flex flex-col justify-between space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
                Win Rate
              </span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  74.2%
                </span>
                <p className="text-caption text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +3.1% vs NIFTY 50
                </p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
                Sharpe Ratio
              </span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  2.18
                </span>
                <p className="text-caption text-slate-500 dark:text-slate-400 mt-0.5">
                  Institutional grade
                </p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
                Alpha (α)
              </span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-emerald-600 dark:text-emerald-400">
                  +6.4%
                </span>
                <p className="text-caption text-slate-500 dark:text-slate-400 mt-0.5">
                  Excess return
                </p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
                Beta (β)
              </span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  0.84
                </span>
                <p className="text-caption text-slate-500 dark:text-slate-400 mt-0.5">
                  Low volatility
                </p>
              </div>
            </Card>
          </div>

          {/* Sentiment Gauge Card */}
          <Card className="flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Market Sentiment
              </h3>
              <Badge variant="emerald" size="sm">
                Bullish (72/100)
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.04]">
                <p className="text-caption text-slate-500 dark:text-slate-400">FII Net Inflow</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                  +₹647 Cr
                </p>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.04]">
                <p className="text-caption text-slate-500 dark:text-slate-400">DII Net Inflow</p>
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                  +₹267 Cr
                </p>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.04]">
                <p className="text-caption text-slate-500 dark:text-slate-400">Put-Call Ratio</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  1.12
                </p>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.04]">
                <p className="text-caption text-slate-500 dark:text-slate-400">India VIX</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  13.4
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Market Indices Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {DEMO_INDICES.map((idx) => {
          const up = idx.change_pct >= 0;
          return (
            <Card key={idx.symbol} interactive className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-caption font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                  {idx.symbol}
                </span>
                <Badge variant={up ? 'emerald' : 'red'} size="sm">
                  {up ? '+' : ''}
                  {idx.change_pct.toFixed(2)}%
                </Badge>
              </div>
              <div className="mt-3">
                <span className="text-h3 font-semibold text-slate-900 dark:text-slate-100">
                  {idx.value.toLocaleString()}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Main Grid: AI Signals, Gainers & Losers, Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AI Top Picks & Signals */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                AI Signals
              </h3>
            </div>
            <Badge variant="indigo" size="sm">
              Live Ensemble
            </Badge>
          </div>

          <div className="space-y-3">
            {DEMO_AI_PICKS.slice(0, 4).map((pick) => (
              <Link
                key={pick.symbol}
                href={`/stocks/${pick.symbol}`}
                className="flex items-center justify-between p-3 rounded-btn bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200/60 dark:border-white/[0.04] transition-all group"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {pick.symbol}
                    </span>
                    <Badge variant={pick.signal.toLowerCase() as any} size="sm">
                      {pick.signal}
                    </Badge>
                  </div>
                  <p className="text-caption text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {pick.reason}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {pick.confidence}%
                  </span>
                  <p className="text-[10px] text-slate-400">confidence</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Center Column: Top Gainers Table */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Top Gainers
              </h3>
            </div>
            <Link href="/watchlist" className="text-caption text-indigo-600 dark:text-indigo-400 hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-2">
            {gainers.map((s) => (
              <Link
                key={s.symbol}
                href={`/stocks/${s.symbol}`}
                className="flex items-center justify-between p-2.5 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {s.symbol}
                  </p>
                  <p className="text-caption text-slate-500 dark:text-slate-400 truncate">{s.name}</p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <Sparkline data={[s.price * 0.96, s.price * 0.98, s.price]} isPositive={true} width={64} height={20} />
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      ₹{s.price.toLocaleString()}
                    </p>
                    <p className="text-caption font-medium text-emerald-600 dark:text-emerald-400">
                      +{s.change_pct.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Right Column: Key Alerts Stream */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Market Alerts
              </h3>
            </div>
            <Link href="/insights" className="text-caption text-indigo-600 dark:text-indigo-400 hover:underline">
              View Stream
            </Link>
          </div>

          <div className="space-y-3">
            {DEMO_ALERTS.slice(0, 4).map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="indigo" size="sm">
                    {alert.type.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] text-slate-400">{alert.time}</span>
                </div>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 mt-2">
                  {alert.title}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
