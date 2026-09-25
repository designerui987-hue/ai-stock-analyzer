'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { 
  Target, Activity, TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Scatter
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

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'TARGET_HIT': return <Badge variant="emerald" size="sm">Target Hit</Badge>;
      case 'SL_HIT': return <Badge variant="red" size="sm">SL Hit</Badge>;
      case 'EXPIRED': return <Badge variant="amber" size="sm">Expired</Badge>;
      default: return <Badge variant="slate" size="sm">Open</Badge>;
    }
  };

  const getPnlColor = (pnl: number | null) => {
    if (pnl === null) return 'text-slate-500';
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
          A transparent, auditable track record of every AI signal issued by the platform. 
          Realized P&L and Win Rates are calculated strictly from closed positions.
        </p>
      </div>

      {/* Empty State warning if track record is too small */}
      {stats.totalClosed < 20 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-card p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Track record is still building</h4>
            <p className="text-sm text-amber-700 dark:text-amber-300/80 mt-1">
              Only {stats.totalClosed} signals have resolved so far. Win rates and calibration metrics may be volatile and not statistically significant until the sample size exceeds 20 closed signals.
            </p>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col">
          <span className="text-caption text-slate-500 font-medium">Overall Win Rate</span>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {stats.winRate?.toFixed(1) || '0.0'}%
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Target Hits vs All Closed</span>
        </Card>

        <Card className="flex flex-col">
          <span className="text-caption text-slate-500 font-medium">Avg Realized P&L</span>
          <div className="flex items-end gap-2 mt-2">
            <span className={`text-h2 font-semibold ${getPnlColor(stats.avgPnl)}`}>
              {stats.avgPnl > 0 ? '+' : ''}{stats.avgPnl?.toFixed(2) || '0.00'}%
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Per closed trade</span>
        </Card>

        <Card className="flex flex-col">
          <span className="text-caption text-slate-500 font-medium">Avg Holding Period</span>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {stats.avgHoldingDays?.toFixed(1) || '0'}
            </span>
            <span className="text-sm text-slate-500 mb-1">days</span>
          </div>
          <span className="text-xs text-slate-400 mt-1">Time to resolution</span>
        </Card>

        <Card className="flex flex-col">
          <span className="text-caption text-slate-500 font-medium">Total Signals</span>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              {stats.totalSignals || 0}
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1">
            {stats.totalClosed} closed, {stats.totalSignals - stats.totalClosed} open
          </span>
        </Card>
      </div>

      {/* Calibration Chart */}
      <Card size="large" className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Confidence Calibration</h3>
          <p className="text-xs text-slate-500 mt-1">
            Compares the model's stated confidence vs its actual historical hit rate in that bucket. 
            Points below the dashed line indicate overconfidence.
          </p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.calibrationData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey="bucket" tick={{fontSize: 12, fill: '#64748b'}} />
              <YAxis domain={[0, 100]} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `${v}%`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                itemStyle={{ color: '#f8fafc' }}
                formatter={(value: number, name: string, props: any) => {
                  if (name === 'hitRate') return [`${value.toFixed(1)}%`, 'Actual Hit Rate'];
                  if (name === 'expectedWinRate') return [`${value}%`, 'Expected Hit Rate'];
                  return [value, name];
                }}
              />
              <Bar dataKey="hitRate" fill="#6366f1" radius={[4, 4, 0, 0]} name="Actual Hit Rate" />
              {/* Plot a subtle bar or dot for the expected line, Recharts handles ReferenceLine better if we had linear X */}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Ledger Table */}
      <Card size="large" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Signal Log</h3>
          
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
                        {s.realized_pnl_pct !== null ? `${s.realized_pnl_pct > 0 ? '+' : ''}${s.realized_pnl_pct.toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    
                    {/* Expanded Content */}
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-[#121826]/50 border-b border-slate-100 dark:border-white/[0.06]">
                        <td colSpan={10} className="px-4 py-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-4 md:pl-8 border-l-2 border-indigo-500/30">
                            <div>
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Rationale</span>
                              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
                                {s.rationale}
                              </p>
                              
                              {s.closed_at && (
                                <div className="mt-4 flex gap-4">
                                  <div>
                                    <span className="text-xs text-slate-500">Closed On</span>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{new Date(s.closed_at).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-slate-500">Exit Price</span>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">₹{s.closed_price?.toFixed(2)}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div>
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Model Consensus & Factors</span>
                              <div className="space-y-2 mt-2">
                                {JSON.parse(s.model_breakdown || '[]').map((m: any, idx: number) => (
                                  <div key={idx} className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.05] space-y-1.5">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-900 dark:text-slate-100 font-bold">{m.name}</span>
                                      <div className="flex gap-2 items-center">
                                        <span className="text-slate-500 font-mono text-[11px]">{m.conf}%</span>
                                        <Badge variant={m.signal?.toLowerCase() as any} size="sm">{m.signal}</Badge>
                                      </div>
                                    </div>
                                    {m.top_factors && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-white/[0.04] pt-1">
                                        Top Factor: <span className="text-slate-700 dark:text-slate-300 font-medium">{m.top_factors[0]?.factor_name}</span> ({m.top_factors[0]?.weight_pct}% weight)
                                      </div>
                                    )}
                                  </div>
                                ))}
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
    </div>
  );
}
