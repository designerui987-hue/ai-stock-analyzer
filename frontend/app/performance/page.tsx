'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { 
  Target, Activity, TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle, ShieldAlert
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function PerformanceLedger() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filters
  const [symbol, setSymbol] = useState('');
  const [status, setStatus] = useState('');
  const [minConf, setMinConf] = useState('');

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (symbol) params.append('symbol', symbol);
      if (status) params.append('status', status);
      if (minConf) params.append('min_confidence', minConf);

      const res = await fetch(`/api/signals/ledger?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [symbol, status, minConf]);

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const { stats, signals } = data || { stats: {}, signals: [] };
  const totalClosed = stats.totalClosed ?? 0;
  const isSampleBelow30 = totalClosed < 30;

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'TARGET_HIT': return <Badge variant="emerald" size="sm">Target Hit</Badge>;
      case 'SL_HIT': return <Badge variant="red" size="sm">SL Hit</Badge>;
      case 'EXPIRED': return <Badge variant="amber" size="sm">Expired</Badge>;
      default: return <Badge variant="neutral" size="sm">Open</Badge>;
    }
  };

  const getPnlColor = (pnl: number | null) => {
    if (pnl === null || pnl === undefined) return 'text-slate-500';
    return pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div>
        <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3">
          <Activity className="text-indigo-600" /> Signal Performance Ledger
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
          An auditable track record of deterministic quantitative signals. Realized P&L,
          Win Rate, and Max Drawdown are calculated strictly from closed positions resolved
          against real daily market bars.
        </p>
      </div>

      {/* Minimum-Sample Warning (< 30 closed signals) per AGENTS.md */}
      {isSampleBelow30 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Statistical Sample Size Warning ({totalClosed} of 30 Closed Signals)
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300/80 mt-1 leading-relaxed">
              Only {totalClosed} signals have resolved so far. Win rates, average returns, and drawdown
              metrics are subject to high sample variance and are not statistically significant until
              the sample size reaches at least <strong>30 closed signals</strong>. Treat current figures as preliminary.
            </p>
          </div>
        </div>
      )}

      {/* Key Metric KPI Cards (Win Rate, Average Return, Max Drawdown, Trade Count) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Win Rate */}
        <Card className="flex flex-col justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
              Win Rate
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                {stats.winRate !== undefined ? stats.winRate.toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400 mt-2">
            Target Hits / Total Closed
          </span>
        </Card>

        {/* 2. Average Return */}
        <Card className="flex flex-col justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
              Average Return
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-h2 font-semibold ${getPnlColor(stats.avgReturn ?? stats.avgPnl)}`}>
                {(stats.avgReturn ?? stats.avgPnl ?? 0) > 0 ? '+' : ''}
                {(stats.avgReturn ?? stats.avgPnl ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400 mt-2">
            Mean P&L per closed trade
          </span>
        </Card>

        {/* 3. Max Drawdown */}
        <Card className="flex flex-col justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
              Max Drawdown
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-h2 font-semibold text-red-600 dark:text-red-400">
                {stats.maxDrawdown !== undefined ? `-${stats.maxDrawdown.toFixed(2)}%` : '0.00%'}
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400 mt-2">
            Peak-to-trough equity decline
          </span>
        </Card>

        {/* 4. Trade Count */}
        <Card className="flex flex-col justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
              Trade Count
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                {stats.tradeCount ?? totalClosed}
              </span>
              <span className="text-xs text-slate-400">
                / {stats.totalSignals || 0} total
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-400 mt-2">
            {stats.openSignals || 0} currently open
          </span>
        </Card>
      </div>

      {/* Confidence Calibration Chart */}
      <Card size="large" className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Confidence Calibration vs Actual Hit Rate
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Compares stated confidence index buckets against actual Target Hit rates.
            Confidence is an index of rule consensus and data completeness (see docs/CONFIDENCE.md).
          </p>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.calibrationData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey="bucket" tick={{fontSize: 12, fill: '#64748b'}} />
              <YAxis domain={[0, 100]} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                itemStyle={{ color: '#f8fafc' }}
                formatter={(value: number, name: string) => {
                  if (name === 'hitRate') return [`${value.toFixed(1)}%`, 'Actual Hit Rate'];
                  return [value, name];
                }}
              />
              <Bar dataKey="hitRate" fill="#6366f1" radius={[4, 4, 0, 0]} name="Actual Hit Rate" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Ledger Table */}
      <Card size="large" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Signal Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click any row to inspect indicators and audit metadata.</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <input 
              type="text" 
              placeholder="Symbol..." 
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] rounded-btn focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] rounded-btn focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="TARGET_HIT">Target Hit</option>
              <option value="SL_HIT">SL Hit</option>
              <option value="EXPIRED">Expired</option>
            </select>
            <select 
              value={minConf} 
              onChange={(e) => setMinConf(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] rounded-btn focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
            >
              <option value="">Any Confidence</option>
              <option value="70">70%+ Only</option>
              <option value="80">80%+ Only</option>
              <option value="90">90%+ Only</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100 dark:border-white/[0.06]">
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Symbol</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Conf</th>
                <th className="py-3 px-4 font-medium">Entry</th>
                <th className="py-3 px-4 font-medium">Target</th>
                <th className="py-3 px-4 font-medium">SL</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">P&L</th>
                <th className="py-3 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-slate-500">
                    No signals found matching filters.
                  </td>
                </tr>
              ) : signals.map((s: any) => {
                const isExpanded = expandedRows.has(s.id);
                let breakdownObj: any = null;
                try {
                  breakdownObj = JSON.parse(s.model_breakdown || '{}');
                } catch {
                  breakdownObj = {};
                }

                return (
                  <React.Fragment key={s.id}>
                    <tr 
                      className={`text-sm border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 dark:bg-white/[0.02]' : ''}`}
                      onClick={() => toggleRow(s.id)}
                    >
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap" suppressHydrationWarning>
                        {new Date(s.issued_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{s.symbol}</td>
                      <td className="py-3 px-4">
                        <span className={s.signal_type === 'BUY' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                          {s.signal_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">{s.confidence_pct}%</td>
                      <td className="py-3 px-4">₹{s.entry_price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 text-xs">₹{s.target_price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-red-600 dark:text-red-400 text-xs">₹{s.stop_loss_price.toFixed(2)}</td>
                      <td className="py-3 px-4">{getStatusBadge(s.status)}</td>
                      <td className={`py-3 px-4 font-semibold ${getPnlColor(s.realized_pnl_pct)}`}>
                        {s.realized_pnl_pct !== null && s.realized_pnl_pct !== undefined ? `${s.realized_pnl_pct > 0 ? '+' : ''}${s.realized_pnl_pct.toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    
                    {/* Expanded Audit Metadata */}
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-[#121826]/50 border-b border-slate-100 dark:border-white/[0.06]">
                        <td colSpan={10} className="px-4 py-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4 md:pl-8 border-l-2 border-indigo-500/30">
                            <div>
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantitative Rationale</span>
                              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
                                {s.rationale}
                              </p>
                              
                              <div className="mt-4 flex flex-wrap gap-4 text-xs">
                                <div>
                                  <span className="text-slate-500">Rule Version</span>
                                  <p className="font-mono text-slate-800 dark:text-slate-200">{s.rule_version || 'v1.0-deterministic-quant'}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Data Source</span>
                                  <p className="font-mono text-slate-800 dark:text-slate-200">{s.source || 'yfinance'}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">As Of</span>
                                  <p className="text-slate-800 dark:text-slate-200">
                                    {s.as_of ? new Date(s.as_of).toLocaleTimeString('en-IN') : new Date(s.issued_at).toLocaleTimeString('en-IN')} IST
                                  </p>
                                </div>
                              </div>

                              {s.closed_at && (
                                <div className="mt-4 flex gap-4 text-xs border-t border-slate-200 dark:border-white/[0.06] pt-3">
                                  <div>
                                    <span className="text-slate-500">Closed On</span>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{new Date(s.closed_at).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Exit Price</span>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">₹{s.closed_price?.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Realized Return</span>
                                    <p className={`font-semibold ${getPnlColor(s.realized_pnl_pct)}`}>
                                      {(s.realized_pnl_pct ?? 0) > 0 ? '+' : ''}{(s.realized_pnl_pct ?? 0).toFixed(2)}%
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div>
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Deterministic Consensus & Score Breakdown
                              </span>
                              <div className="p-3 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.05] space-y-2 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">Rules Consensus:</span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    {breakdownObj.rules_agreed ?? 4} / 5 rules agree
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">Data Completeness:</span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    +{breakdownObj.data_completeness_points ?? 20} pts
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">Rule Points:</span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    +{breakdownObj.rule_consensus_points ?? 30} pts
                                  </span>
                                </div>
                                <div className="flex justify-between items-center border-t border-slate-100 dark:border-white/[0.05] pt-1.5">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">Total Confidence:</span>
                                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{s.confidence_pct}%</span>
                                </div>
                                <p className="text-[10px] text-slate-400 pt-1 italic">
                                  Formula: Base(40) + Data(0-20) + Consensus(0-40). See docs/CONFIDENCE.md.
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Regulatory Disclaimer per AGENTS.md Rule 7 */}
      <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 py-3 border-t border-slate-200 dark:border-white/[0.06]">
        Disclaimer: All signal metrics and performance stats are generated from deterministic rules on real historical market data. 
        Past performance is no guarantee of future returns. Not investment advice.
      </div>
    </div>
  );
}
