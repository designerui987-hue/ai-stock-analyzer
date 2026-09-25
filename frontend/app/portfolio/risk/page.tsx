'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  PieChart as PieIcon,
  TrendingDown,
  Layers,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DEMO_PORTFOLIO } from '@/lib/data';
import {
  calculatePortfolioHeat,
  calculateSectorConcentration,
  checkSectorCorrelation,
  HoldingPosition,
} from '@/lib/positionSizing';

export default function PortfolioRiskDashboard() {
  const p = DEMO_PORTFOLIO;
  const capital = 1183500; // Account Capital

  const holdings: HoldingPosition[] = p.holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    qty: h.qty,
    avg_price: h.avg_price,
    current_price: h.current_price,
    stop_loss: parseFloat((h.avg_price * 0.94).toFixed(2)), // 6% trailing SL
    sector: h.sector,
  }));

  const heat = calculatePortfolioHeat(holdings, capital);
  const sectorConc = calculateSectorConcentration(holdings, capital);
  const correlationWarnings = checkSectorCorrelation(holdings);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Portfolio Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="text-indigo-600 dark:text-indigo-400" /> Portfolio Risk Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Institutional portfolio heat analysis, open position risk, and sector concentration controls
          </p>
        </div>

        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pb-1">
          <Link
            href="/portfolio"
            className="px-4 py-2 rounded-btn text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Holdings Overview
          </Link>
          <Link
            href="/portfolio/risk"
            className="px-4 py-2 rounded-btn text-xs font-semibold bg-indigo-600 text-white shadow-subtle flex items-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5" /> Risk & Portfolio Heat
          </Link>
        </div>
      </div>

      {/* Total Portfolio Heat Red Warning Banner (if heat >= 6%) */}
      {heat.is_heat_warning ? (
        <div className="bg-red-500/10 border border-red-500/25 rounded-card p-4 flex items-start gap-3 text-red-900 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-red-900 dark:text-red-100 flex items-center gap-2">
              High Portfolio Heat Alert: {heat.total_heat_pct}% Capital At Risk
            </h4>
            <p className="text-xs text-red-700 dark:text-red-300/90 mt-1 leading-relaxed">
              If all open positions trigger their stop-losses simultaneously, your account will incur a total drawdown of <strong>₹{heat.total_risk_amount.toLocaleString()}</strong> ({heat.total_heat_pct}% of total capital). Institutional guidelines recommend keeping total portfolio heat under 6.0%.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-card p-4 flex items-center gap-3 text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
            <strong>Optimal Risk Control:</strong> Total portfolio heat is at <strong>{heat.total_heat_pct}%</strong> (below 6% threshold). Your account risk is well-managed.
          </span>
        </div>
      )}

      {/* Top Risk Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 font-medium">Trading Account Capital</span>
          <div className="mt-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              ₹{(capital / 100000).toFixed(2)}L
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Configured Capital Baseline</span>
        </Card>

        <Card className={`flex flex-col justify-between ${heat.is_heat_warning ? 'border-red-500/40 bg-red-500/[0.02]' : ''}`}>
          <span className="text-caption text-slate-500 font-medium">Total Portfolio Heat</span>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className={`text-h2 font-semibold ${heat.is_heat_warning ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {heat.total_heat_pct}%
            </span>
            <Badge variant={heat.is_heat_warning ? 'red' : 'emerald'} size="sm">
              ₹{(heat.total_risk_amount / 1000).toFixed(1)}k Risk
            </Badge>
          </div>
          <span className="text-xs text-slate-400 mt-1">Max Drawdown if all SL hit</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 font-medium">Top Sector Concentration</span>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {sectorConc.sectors[0]?.pct || 0}%
            </span>
            <span className="text-xs text-slate-500">({sectorConc.sectors[0]?.sector})</span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Max recommended: 35%</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 font-medium">Sector Correlation Risk</span>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {correlationWarnings.length}
            </span>
            <span className="text-xs text-slate-500">Warnings</span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Multiple bets in same sector</span>
        </Card>
      </div>

      {/* Sector Concentration Heatmap Bar */}
      <Card size="large" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Sector Capital Allocation & Exposure Controls
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualizes portfolio concentration per sector against the 35% institutional over-exposure threshold.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {sectorConc.sectors.map((s) => (
            <div key={s.sector} className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {s.sector}
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500">₹{(s.value / 1000).toFixed(1)}k</span>
                  <span className={`font-bold ${s.is_breached ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {s.pct}%
                  </span>
                  {s.is_breached && <Badge variant="red" size="sm">Over-Exposed (&gt;35%)</Badge>}
                </div>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    s.is_breached ? 'bg-red-500' : 'bg-indigo-600'
                  }`}
                  style={{ width: `${Math.min(100, s.pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Concentrated Sector Bet Warnings Card */}
      {correlationWarnings.length > 0 && (
        <Card size="large" className="bg-amber-500/[0.03] border-amber-500/30 space-y-3">
          <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
            <Layers className="w-4 h-4" />
            <span>Concentrated Sector Correlation Warnings</span>
          </div>
          <div className="space-y-2">
            {correlationWarnings.map((warn, idx) => (
              <div key={idx} className="flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>{warn}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Open Positions Risk Table */}
      <Card size="large" className="space-y-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Open Positions Risk Matrix
          </h3>
          <span className="text-caption text-slate-500">Calculated against trailing Stop-Losses</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/[0.08]">
                <th className="py-2.5 px-4">Symbol</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Current Value</th>
                <th className="py-2.5 px-3 text-right">Stop-Loss</th>
                <th className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">₹ Risk if SL Hit</th>
                <th className="py-2.5 px-4 text-right text-red-600 dark:text-red-400">% Capital at Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {heat.positions_risk.map((pos) => (
                <tr key={pos.symbol} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                    <Link href={`/stocks/${pos.symbol}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                      {pos.symbol}
                    </Link>
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {holdings.find((h) => h.symbol === pos.symbol)?.sector}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                    {pos.qty}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 font-medium">
                    ₹{pos.current_val.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">
                    ₹{pos.stop_loss.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-red-600 dark:text-red-400">
                    -₹{pos.risk_amount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {pos.risk_pct_of_capital}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
