'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  BarChart2,
  Calendar,
  Percent,
  DollarSign,
  Layers,
  ArrowRight,
  AlertTriangle,
  Play,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const POPULAR_NSE_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'BHARTIARTL',
  'LT',
  'SBIN',
];

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [customSymbol, setCustomSymbol] = useState('');
  const [years, setYears] = useState(3);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const runBacktest = async (sym: string = symbol, y: number = years, cap: number = initialCapital) => {
    setLoading(true);
    setError(null);
    try {
      const activeSym = (customSymbol.trim() || sym).toUpperCase().replace('.NS', '');
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(
        `${backendUrl}/api/stocks/backtest?symbol=${encodeURIComponent(activeSym)}&years=${y}&initial_capital=${cap}`
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail?.reason || `Backtest failed with status ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to complete backtest');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runBacktest('RELIANCE', 3, 100000);
  }, []);

  const metrics = result?.metrics;
  const benchmark = result?.benchmark;
  const friction = result?.friction_breakdown;
  const splits = result?.walk_forward_splits || [];
  const equityCurve = result?.equity_curve || [];
  const trades = result?.trades || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Quantitative Backtesting Engine
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Walk-forward backtest of production deterministic rules (<code className="text-indigo-600 dark:text-indigo-400">v1.0-deterministic-quant</code>) vs NIFTY 50 benchmark. Includes Indian brokerage, STT, and slippage. Zero lookahead bias.
          </p>
        </div>

        {/* Global Mandatory SEBI Disclaimer */}
        <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-700 dark:text-amber-300 font-medium max-w-md">
          ⚠️ <strong>Regulatory Disclaimer:</strong> Backtested results are hypothetical simulations and not investment advice. Past performance is not indicative of future returns.
        </div>
      </div>

      {/* Control Configuration Bar */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Symbol Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
              NSE Symbol
            </label>
            <div className="flex gap-2">
              <select
                value={customSymbol ? '' : symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setCustomSymbol('');
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {POPULAR_NSE_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s} (NSE)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Symbol Input */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
              Or Custom NSE Ticker
            </label>
            <input
              type="text"
              placeholder="e.g. TATAMOTORS, ITC"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Duration & Capital */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                Duration
              </label>
              <select
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={1}>1 Year</option>
                <option value={3}>3 Years</option>
                <option value={5}>5 Years</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                Capital (₹)
              </label>
              <input
                type="number"
                step="10000"
                min="10000"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Run Button */}
          <div>
            <Button
              variant="primary"
              onClick={() => runBacktest(symbol, years, initialCapital)}
              disabled={loading}
              className="w-full justify-center text-xs font-semibold py-2.5 !bg-indigo-600 hover:!bg-indigo-700 text-white"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  Simulating...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  Run Quantitative Backtest
                </span>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result Metrics */}
      {result && metrics && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* CAGR Card */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Strategy CAGR</span>
              <div className="flex items-baseline space-x-1">
                <span
                  className={`text-xl font-bold font-mono ${
                    metrics.cagr_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {metrics.cagr_pct > 0 ? `+${metrics.cagr_pct}%` : `${metrics.cagr_pct}%`}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                vs NIFTY {benchmark?.cagr_pct}%
              </p>
            </Card>

            {/* Max Drawdown */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Max Drawdown</span>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                -{metrics.max_drawdown_pct}%
              </div>
              <p className="text-[10px] text-slate-400">
                NIFTY DD: -{benchmark?.max_drawdown_pct}%
              </p>
            </Card>

            {/* Sharpe Ratio */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Sharpe Ratio</span>
              <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {metrics.sharpe_ratio}
              </div>
              <p className="text-[10px] text-slate-400">
                RBI Repo (Rf): 6.0%
              </p>
            </Card>

            {/* Win Rate */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Win Rate</span>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {metrics.win_rate_pct}%
              </div>
              <p className="text-[10px] text-slate-400">
                {result.winning_trades}W / {result.losing_trades}L
              </p>
            </Card>

            {/* Profit Factor */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Profit Factor</span>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {metrics.profit_factor}
              </div>
              <p className="text-[10px] text-slate-400">
                Gross Gains / Losses
              </p>
            </Card>

            {/* Trade Count */}
            <Card className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Total Trades</span>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {metrics.trade_count}
              </div>
              <p className="text-[10px] text-slate-400">
                Friction: ₹{friction?.total_friction_paid?.toLocaleString() || 0}
              </p>
            </Card>
          </div>

          {/* Equity Chart: Strategy vs Benchmark */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Portfolio Equity Curve vs NIFTY 50 Benchmark
                </h3>
                <p className="text-[11px] text-slate-500">
                  Net portfolio value after deducting ₹20 brokerage, 0.1% STT, 0.05% slippage, and GST on each trade.
                </p>
              </div>

              <div className="flex items-center space-x-4 text-xs font-semibold">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
                  <span className="text-slate-700 dark:text-slate-300">
                    Strategy ({result.symbol})
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span>
                  <span className="text-slate-500">NIFTY 50 Buy & Hold</span>
                </div>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#888' }}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#888' }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                    formatter={(val: any, name: any) => [
                      `₹${Number(val).toLocaleString()}`,
                      name === 'equity' ? `Strategy (${result.symbol})` : 'NIFTY 50 Benchmark',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Two-Column Section: Walk-Forward Splits & Friction Model */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Walk-Forward Splits */}
            <Card className="lg:col-span-2 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Walk-Forward Cross-Validation Windows
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Timeline split into In-Sample calibration and sequential Out-of-Sample test windows to guard against overfitting.
                  </p>
                </div>
                <Badge variant="indigo" size="sm">
                  Zero Lookahead
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Split Window</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Period</th>
                      <th className="py-2 text-right">Window Return</th>
                      <th className="py-2 text-right">Max Drawdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {splits.map((s: any) => (
                      <tr key={s.split_number}>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">
                          Split #{s.split_number}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium ${
                              s.split_number === 1
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 text-[11px]">
                          {s.start_date} → {s.end_date}
                        </td>
                        <td
                          className={`py-2.5 text-right font-bold ${
                            s.return_pct >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {s.return_pct > 0 ? `+${s.return_pct}%` : `${s.return_pct}%`}
                        </td>
                        <td className="py-2.5 text-right text-amber-600 dark:text-amber-400">
                          -{s.max_drawdown_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Indian Market Friction Breakdown */}
            <Card className="p-5 space-y-4">
              <div className="border-b border-slate-100 dark:border-white/5 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Indian Transaction Friction
                </h3>
                <p className="text-[11px] text-slate-500">
                  Real costs deducted on every simulation leg.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500">Discount Brokerage</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    ₹{friction?.brokerage_per_order || 20} / order
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500">STT (Delivery)</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {friction?.stt_pct || 0.1}% on turnover
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500">Execution Slippage</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {friction?.slippage_pct || 0.05}% per leg
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                  <span className="text-slate-500">Exchange Turnover + GST</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    0.0035% + 18% GST
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex justify-between items-center mt-3">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Total Friction Paid
                  </span>
                  <span className="font-mono font-bold text-red-600 dark:text-red-400 text-sm">
                    ₹{friction?.total_friction_paid?.toLocaleString() || 0}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Trade History Blotter */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Recent Simulated Trades ({trades.length} of {result.trade_count})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Conservative resolution: same-bar target and stop hit triggers Stop Loss (SL_HIT).
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Initial: ₹{result.initial_capital?.toLocaleString()} → Final: ₹{result.final_capital?.toLocaleString()}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400 uppercase text-[10px]">
                    <th className="py-2">Entry Date</th>
                    <th className="py-2">Exit Date</th>
                    <th className="py-2">Side</th>
                    <th className="py-2">Entry ₹</th>
                    <th className="py-2">Exit ₹</th>
                    <th className="py-2 text-right">Net PnL %</th>
                    <th className="py-2 text-right">Net Return (₹)</th>
                    <th className="py-2 text-right">Friction</th>
                    <th className="py-2 text-center">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                  {trades.map((t: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-2 text-slate-600 dark:text-slate-400">{t.entry_date}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-400">{t.exit_date}</td>
                      <td className="py-2">
                        <Badge variant={t.side === 'BUY' ? 'emerald' : 'red'} size="sm">
                          {t.side}
                        </Badge>
                      </td>
                      <td className="py-2 font-semibold text-slate-900 dark:text-slate-100">₹{t.entry_price}</td>
                      <td className="py-2 font-semibold text-slate-900 dark:text-slate-100">₹{t.exit_price}</td>
                      <td
                        className={`py-2 text-right font-bold ${
                          t.return_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.return_pct > 0 ? `+${t.return_pct}%` : `${t.return_pct}%`}
                      </td>
                      <td
                        className={`py-2 text-right font-bold ${
                          t.net_pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.net_pnl >= 0 ? `+₹${t.net_pnl.toLocaleString()}` : `-₹${Math.abs(t.net_pnl).toLocaleString()}`}
                      </td>
                      <td className="py-2 text-right text-slate-400 text-[11px]">
                        ₹{t.friction_paid}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-medium ${
                            t.exit_reason === 'TARGET_HIT'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : t.exit_reason === 'STOP_LOSS_HIT'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {t.exit_reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

