'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  TrendingUp,
  Target,
  ShieldAlert,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DEMO_STOCKS } from '@/lib/data';
import { getOptionChainSummary, OptionChainEntry } from '@/lib/optionChain';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function OptionsChainPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();
  const stock = DEMO_STOCKS.find((s) => s.symbol === symbol) || DEMO_STOCKS[0];

  const expiries = [
    { label: '30 JUL 2026 (Weekly)', date: '2026-07-30', dte: 3 },
    { label: '06 AUG 2026 (Weekly)', date: '2026-08-06', dte: 10 },
    { label: '27 AUG 2026 (Monthly)', date: '2026-08-27', dte: 31 },
  ];

  const [selectedExpiry, setSelectedExpiry] = useState(expiries[0]);

  const { entries, summary } = getOptionChainSummary(stock.symbol, stock.price, selectedExpiry.date);

  // Compute maximum OI for heatmap cell shading scale
  const maxCallOI = Math.max(...entries.map((e) => e.call.oi), 1);
  const maxPutOI = Math.max(...entries.map((e) => e.put.oi), 1);

  // Prepare chart data for OI buildup by strike
  const chartData = entries.map((e) => ({
    strike: e.strike_price,
    'Call OI': e.call.oi,
    'Put OI': e.put.oi,
    isATM: e.strike_price === summary.atm_strike,
  }));

  // Function to compute cell heatmap background opacity
  const getCallOIBg = (oi: number) => {
    const ratio = oi / maxCallOI;
    if (ratio > 0.75) return 'bg-emerald-500/25 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-bold';
    if (ratio > 0.45) return 'bg-emerald-500/15 dark:bg-emerald-500/20 text-slate-900 dark:text-slate-100 font-semibold';
    if (ratio > 0.25) return 'bg-emerald-500/10 dark:bg-emerald-500/10 text-slate-800 dark:text-slate-200';
    return '';
  };

  const getPutOIBg = (oi: number) => {
    const ratio = oi / maxPutOI;
    if (ratio > 0.75) return 'bg-red-500/25 dark:bg-red-500/30 text-red-900 dark:text-red-200 font-bold';
    if (ratio > 0.45) return 'bg-red-500/15 dark:bg-red-500/20 text-slate-900 dark:text-slate-100 font-semibold';
    if (ratio > 0.25) return 'bg-red-500/10 dark:bg-red-500/10 text-slate-800 dark:text-slate-200';
    return '';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Card & Navigation Tabs */}
      <Card size="large" className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
                {stock.symbol} Options Analytics
              </h1>
              <Badge variant="indigo" size="md">
                NSE Derivatives
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {stock.name} · Open Interest, Max Pain & Volatility Skew Analysis
            </p>
          </div>

          <div className="flex items-center space-x-6">
            <div className="text-right">
              <span className="text-caption text-slate-500">Spot CMP</span>
              <div className="text-h1 font-semibold text-slate-900 dark:text-slate-100">
                ₹{stock.price.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation: Stock Overview vs Options Chain */}
        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pb-3">
          <Link
            href={`/stocks/${stock.symbol}`}
            className="px-4 py-2 rounded-btn text-xs font-semibold transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            Overview & Technicals
          </Link>
          <Link
            href={`/stocks/${stock.symbol}/options`}
            className="px-4 py-2 rounded-btn text-xs font-semibold bg-indigo-600 text-white shadow-subtle flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" /> Options Chain & F&O
          </Link>
        </div>
      </Card>

      {/* Mock Data Notice Banner */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-card p-4 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
        <div className="flex items-center space-x-2.5">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Illustrative Sample Chain:</strong> Data shown is sample/illustrative derivatives data structured for testing pending live exchange feed integration.
          </span>
        </div>
        <span className="font-mono text-[11px] opacity-75 shrink-0 ml-2">NSE API Ready</span>
      </div>

      {/* Key Metrics Header Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <span className="text-caption text-slate-500 font-medium">Spot Price</span>
          <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-1">
            ₹{stock.price.toFixed(2)}
          </p>
          <span className="text-caption text-slate-400">ATM: ₹{summary.atm_strike}</span>
        </Card>

        <Card className="border-indigo-500/30">
          <span className="text-caption text-indigo-600 dark:text-indigo-400 font-medium">Max Pain Strike</span>
          <p className="text-h3 font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
            ₹{summary.max_pain}
          </p>
          <span className="text-caption text-slate-400">Writer Settlement</span>
        </Card>

        <Card>
          <span className="text-caption text-slate-500 font-medium">Put-Call Ratio (PCR)</span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span
              className={`text-h3 font-semibold ${
                summary.pcr_signal === 'BULLISH'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : summary.pcr_signal === 'BEARISH'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {summary.pcr}
            </span>
            <Badge
              variant={
                summary.pcr_signal === 'BULLISH'
                  ? 'emerald'
                  : summary.pcr_signal === 'BEARISH'
                  ? 'red'
                  : 'slate'
              }
              size="sm"
            >
              {summary.pcr_signal}
            </Badge>
          </div>
          <span className="text-caption text-slate-400">Overall Chain OI</span>
        </Card>

        <Card>
          <span className="text-caption text-slate-500 font-medium">ATM Volatility (IV)</span>
          <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-1">
            {summary.atm_iv}%
          </p>
          <span className="text-caption text-slate-400">Implication: Normal</span>
        </Card>

        <Card>
          <span className="text-caption text-slate-500 font-medium">Key Support (Put OI)</span>
          <p className="text-h3 font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
            ₹{summary.support_strike}
          </p>
          <span className="text-caption text-slate-400">Strongest Put Base</span>
        </Card>

        <Card>
          <span className="text-caption text-slate-500 font-medium">Key Resistance (Call OI)</span>
          <p className="text-h3 font-semibold text-red-600 dark:text-red-400 mt-1">
            ₹{summary.resistance_strike}
          </p>
          <span className="text-caption text-slate-400">Strongest Call Wall</span>
        </Card>
      </div>

      {/* Max Pain & Market Positioning Plain-Language Insight Card */}
      <Card size="large" className="bg-slate-50/50 dark:bg-slate-900/50 border-indigo-500/20 space-y-3">
        <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
          <Target className="w-4 h-4" />
          <span>Derivatives Positioning Summary</span>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Max Pain is positioned at <strong className="text-slate-900 dark:text-slate-100">₹{summary.max_pain}</strong> — option writers are heavily positioned for price to settle near this level by expiry. 
          Highest Put OI at <strong className="text-emerald-600 dark:text-emerald-400">₹{summary.support_strike}</strong> establishes crucial downside support, while highest Call OI at <strong className="text-red-600 dark:text-red-400">₹{summary.resistance_strike}</strong> signals immediate overhead resistance.
        </p>
        <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
          <span>Volatility Skew: <strong className="text-slate-700 dark:text-slate-300">{summary.iv_skew}</strong></span>
          <span>·</span>
          <span>Estimated Rollover: <strong className="text-slate-700 dark:text-slate-300">{summary.rollover_pct}%</strong></span>
        </div>
      </Card>

      {/* Expiry Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select Expiry Date:</span>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {expiries.map((e) => (
            <button
              key={e.date}
              onClick={() => setSelectedExpiry(e)}
              className={`px-3.5 py-1.5 rounded-btn text-xs font-semibold shrink-0 transition-colors ${
                selectedExpiry.date === e.date
                  ? 'bg-indigo-600 text-white shadow-subtle'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mini OI-Buildup Visual Chart */}
      <Card size="large" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Open Interest Distribution Across Strikes
            </h3>
          </div>
          <span className="text-caption text-slate-500">Calls (Green) vs Puts (Red)</span>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
              <XAxis dataKey="strike" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}
                formatter={(value: number) => [value.toLocaleString(), 'OI']}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Call OI" fill="#10b981" radius={[3, 3, 0, 0]} name="Call OI (Resistance)" />
              <Bar dataKey="Put OI" fill="#ef4444" radius={[3, 3, 0, 0]} name="Put OI (Support)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Standard NSE Option Chain Table */}
      <Card size="large" className="space-y-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Standard NSE Option Chain Matrix
          </h3>
          <div className="flex items-center space-x-3 text-caption text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500/30" /> Heavy Call Base
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-red-500/30" /> Heavy Put Base
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/[0.08]">
                <th colSpan={4} className="py-2.5 px-3 border-r border-slate-200 dark:border-white/[0.08] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  CALLS (CE)
                </th>
                <th className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100 bg-slate-200/60 dark:bg-slate-800">
                  STRIKE
                </th>
                <th colSpan={4} className="py-2.5 px-3 border-l border-slate-200 dark:border-white/[0.08] text-red-600 dark:text-red-400 uppercase tracking-wider">
                  PUTS (PE)
                </th>
              </tr>
              <tr className="text-slate-500 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-900/40 font-medium">
                <th className="py-2 px-3">OI</th>
                <th className="py-2 px-3">OI Chg</th>
                <th className="py-2 px-3">IV %</th>
                <th className="py-2 px-3 border-r border-slate-200 dark:border-white/[0.06]">LTP (₹)</th>
                <th className="py-2 px-4 font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80">
                  Price
                </th>
                <th className="py-2 px-3 border-l border-slate-200 dark:border-white/[0.06]">LTP (₹)</th>
                <th className="py-2 px-3">IV %</th>
                <th className="py-2 px-3">OI Chg</th>
                <th className="py-2 px-3">OI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {entries.map((e) => {
                const isATM = e.strike_price === summary.atm_strike;

                return (
                  <tr
                    key={e.strike_price}
                    className={`hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${
                      isATM ? 'bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-500/30' : ''
                    }`}
                  >
                    {/* CALLS */}
                    <td className={`py-2.5 px-3 font-mono transition-colors ${getCallOIBg(e.call.oi)}`}>
                      {e.call.oi.toLocaleString()}
                    </td>
                    <td className={`py-2.5 px-3 font-mono ${e.call.oi_change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {e.call.oi_change >= 0 ? '+' : ''}
                      {e.call.oi_change.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{e.call.iv}%</td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-white/[0.06]">
                      ₹{e.call.ltp.toFixed(2)}
                    </td>

                    {/* STRIKE PRICE */}
                    <td className={`py-2.5 px-4 font-bold font-mono text-slate-900 dark:text-slate-100 bg-slate-100/60 dark:bg-slate-800/60 ${isATM ? 'text-indigo-600 dark:text-indigo-400 font-black' : ''}`}>
                      {e.strike_price}
                      {isATM && <span className="block text-[9px] font-normal text-indigo-500">ATM</span>}
                    </td>

                    {/* PUTS */}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-white/[0.06]">
                      ₹{e.put.ltp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{e.put.iv}%</td>
                    <td className={`py-2.5 px-3 font-mono ${e.put.oi_change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {e.put.oi_change >= 0 ? '+' : ''}
                      {e.put.oi_change.toLocaleString()}
                    </td>
                    <td className={`py-2.5 px-3 font-mono transition-colors ${getPutOIBg(e.put.oi)}`}>
                      {e.put.oi.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
