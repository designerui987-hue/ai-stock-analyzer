'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, AlertTriangle, RefreshCw, Lightbulb, PieChart as PieIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sparkline } from '@/components/ui/Sparkline';
import { DEMO_PORTFOLIO, formatNumber } from '@/lib/data';

export default function PortfolioPage() {
  const p = DEMO_PORTFOLIO;
  const isPositive = p.total_pnl >= 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Portfolio Top Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total Invested
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              ₹{(p.total_invested / 100000).toFixed(2)}L
            </span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Current Value
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              ₹{(p.current_value / 100000).toFixed(2)}L
            </span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total P&L
          </span>
          <div className="mt-3 flex items-baseline space-x-2">
            <span
              className={`text-h2 font-semibold ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isPositive ? '+' : ''}₹{(p.total_pnl / 1000).toFixed(1)}K
            </span>
            <Badge variant={isPositive ? 'emerald' : 'red'} size="sm">
              {isPositive ? '+' : ''}
              {p.total_pnl_pct}%
            </Badge>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Today's P&L
          </span>
          <div className="mt-3 flex items-baseline space-x-2">
            <span
              className={`text-h2 font-semibold ${
                p.day_pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {p.day_pnl >= 0 ? '+' : ''}₹{formatNumber(p.day_pnl)}
            </span>
            <Badge variant={p.day_pnl >= 0 ? 'emerald' : 'red'} size="sm">
              {p.day_pnl_pct >= 0 ? '+' : ''}
              {p.day_pnl_pct}%
            </Badge>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total Holdings
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-indigo-600 dark:text-indigo-400">
              {p.holdings_count} Stocks
            </span>
          </div>
        </Card>
      </div>

      {/* Main Grid: Holdings Table & Allocation / AI Rebalancing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Detailed Holdings Table */}
        <Card size="large" noPadding className="lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Portfolio Holdings
                </h3>
                <p className="text-caption text-slate-500 dark:text-slate-400">
                  Real-time equity positions & cost basis
                </p>
              </div>
              <Button variant="outline" size="sm">
                Export CSV
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="sys-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg Price</th>
                    <th className="text-right">CMP</th>
                    <th className="text-center">Trend</th>
                    <th className="text-right">P&L</th>
                    <th className="text-right">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {p.holdings.map((h) => {
                    const pos = h.pnl >= 0;
                    return (
                      <tr key={h.symbol}>
                        <td>
                          <Link href={`/stocks/${h.symbol}`} className="group">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {h.symbol}
                            </div>
                            <div className="text-caption text-slate-500 dark:text-slate-400">
                              {h.name}
                            </div>
                          </Link>
                        </td>
                        <td className="text-right font-medium">{h.qty}</td>
                        <td className="text-right text-slate-600 dark:text-slate-400">
                          ₹{formatNumber(h.avg_price)}
                        </td>
                        <td className="text-right font-semibold">
                          ₹{formatNumber(h.current_price)}
                        </td>
                        <td className="text-center py-3">
                          <Sparkline
                            data={[h.avg_price, (h.avg_price + h.current_price) / 2, h.current_price]}
                            isPositive={pos}
                            width={56}
                            height={20}
                          />
                        </td>
                        <td
                          className={`text-right font-medium ${
                            pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {pos ? '+' : ''}₹{formatNumber(h.pnl)}
                        </td>
                        <td className="text-right">
                          <Badge variant={pos ? 'emerald' : 'red'} size="sm">
                            {pos ? '+' : ''}
                            {h.pnl_pct}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Right Column: Sector Breakdown & AI Rebalancing */}
        <div className="space-y-6">
          {/* Sector Allocation Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <PieIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sector Allocation
                </h3>
              </div>
              <span className="text-caption text-slate-500">Target Balanced</span>
            </div>

            <div className="space-y-3">
              {Object.entries(p.sector_allocation)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([sector, pct]) => (
                  <div key={sector} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {sector}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {pct as number}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                        style={{ width: `${pct as number}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          {/* AI Rebalancing Recommendations Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  AI Rebalancing Insights
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-btn bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center space-x-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>High IT Sector Weight (32.5%)</span>
                </div>
                <p className="text-caption text-slate-600 dark:text-slate-400 mt-1">
                  Consider trimming IT exposure by 4% to reduce concentration risk ahead of earnings.
                </p>
              </div>

              <div className="p-3 rounded-btn bg-indigo-500/10 border border-indigo-500/20">
                <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                  <span>Defensive Allocation Opportunity</span>
                </div>
                <p className="text-caption text-slate-600 dark:text-slate-400 mt-1">
                  Add 3-5% weight in Pharma (e.g. SUNPHARMA) to balance macro volatility.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
