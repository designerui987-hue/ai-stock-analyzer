'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  Briefcase,
  AlertTriangle,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { api, auth } from '@/lib/api';

const DEFAULT_WATCHLIST = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'];
const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const RANGES = ['1M', '3M', '6M', '1Y'];

function formatIst(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return (
      new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'short',
        timeStyle: 'short',
      }) + ' IST'
    );
  } catch {
    return iso;
  }
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  // Market benchmarks & session telemetry
  const [overview, setOverview] = React.useState<any>(null);
  const [indices, setIndices] = React.useState<any[]>([]);

  // Selected stock chart state
  const [selectedSymbol, setSelectedSymbol] = React.useState<string>('RELIANCE');
  const [selectedRange, setSelectedRange] = React.useState<string>('3M');
  const [chartData, setChartData] = React.useState<Array<{ time: string; value: number }>>([]);
  const [chartStatus, setChartStatus] = React.useState<{ ok: boolean; reason?: string; source?: string; asOf?: string | null }>({
    ok: false,
    reason: 'Loading chart series...',
  });

  // Watchlist & quote state
  const [watchlistSymbols, setWatchlistSymbols] = React.useState<string[]>(DEFAULT_WATCHLIST);
  const [watchlistQuotes, setWatchlistQuotes] = React.useState<Record<string, any>>({});
  const [transportStatus, setTransportStatus] = React.useState('CONNECTING');
  const [clock, setClock] = React.useState(Date.now);

  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  // Portfolio & Paper ledger state
  const [portfolio, setPortfolio] = React.useState<any>(null);
  const [performance, setPerformance] = React.useState<any>(null);
  const [paperSummary, setPaperSummary] = React.useState<{ count: number; openCount: number; filledNotional: number } | null>(null);

  // Real deterministic signals & alerts
  const [aiPicks, setAiPicks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchChart = React.useCallback(async (sym: string, range: string) => {
    try {
      const chartRes = await api.getChartData(sym, range).catch(() => null);
      if (Array.isArray(chartRes) && chartRes.length > 0 && chartRes[0]?.close) {
        setChartData(
          chartRes.map((c: any) => ({
            time: c.date,
            value: Number(c.close),
          }))
        );
        const lastBar = chartRes[chartRes.length - 1];
        setChartStatus({
          ok: true,
          source: lastBar.source || 'yfinance',
          asOf: lastBar.date,
        });
      } else {
        setChartData([]);
        setChartStatus({
          ok: false,
          reason: `Historical chart series unavailable for ${sym} (${range}).`,
        });
      }
    } catch {
      setChartData([]);
      setChartStatus({
        ok: false,
        reason: `Failed to load chart for ${sym}.`,
      });
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const authed = auth.isAuthenticated();
    setIsAuthenticated(authed);

    async function loadDashboard() {
      try {
        const [overviewRes, picksRes] = await Promise.all([
          api.getMarketOverview().catch(() => null),
          api.getAIPicks().catch(() => null),
        ]);

        if (!isMounted) return;

        if (overviewRes) {
          setOverview(overviewRes);
          if (Array.isArray(overviewRes.indices)) {
            setIndices(overviewRes.indices);
          }
        }

        if (Array.isArray(picksRes)) {
          setAiPicks(picksRes);
        }

        let userSymbols = DEFAULT_WATCHLIST;

        if (authed) {
          const [portRes, perfRes, paperOrdersRes, userWatchlistRes] = await Promise.all([
            api.getPortfolio().catch(() => null),
            api.getPortfolioPerformance().catch(() => null),
            fetch('/api/broker/orders?mode=PAPER', { headers: auth.getAuthHeaders() })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            api.getWatchlist().catch(() => null),
          ]);

          if (!isMounted) return;

          if (portRes) setPortfolio(portRes);
          if (perfRes) setPerformance(perfRes);

          if (userWatchlistRes?.success && Array.isArray(userWatchlistRes.items) && userWatchlistRes.items.length > 0) {
            userSymbols = userWatchlistRes.items.map((i: any) => i.symbol.toUpperCase());
            setWatchlistSymbols(userSymbols);
            setSelectedSymbol(userSymbols[0]);
          }

          if (paperOrdersRes && Array.isArray(paperOrdersRes.orders)) {
            const pOrders = paperOrdersRes.orders;
            const openCount = pOrders.filter((o: any) => o.status === 'OPEN' || o.status === 'ACCEPTED').length;
            const filledNotional = pOrders
              .filter((o: any) => o.status === 'FILLED' || o.status === 'COMPLETE')
              .reduce((sum: number, o: any) => sum + Number(o.price || 0) * Number(o.quantity || 0), 0);
            setPaperSummary({
              count: pOrders.length,
              openCount,
              filledNotional,
            });
          }
        }

        await fetchChart(userSymbols[0] || 'RELIANCE', selectedRange);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [fetchChart]);

  // Real-time price SSE subscription for current watchlist
  React.useEffect(() => {
    let isMounted = true;
    const authed = auth.isAuthenticated();
    let unsub: (() => void) | undefined;

    if (authed && watchlistSymbols.length > 0) {
      unsub = api.subscribePriceStream(
        watchlistSymbols,
        (payload: Record<string, any>) => {
          if (!isMounted || !payload || typeof payload !== 'object') return;
          setWatchlistQuotes((prev) => ({ ...prev, ...payload }));
          setClock(Date.now());
          setTransportStatus('CONNECTED');

          // Update active selected stock chart if live tick arrives
          const activeTick = payload[selectedSymbol];
          if (activeTick?.as_of && typeof activeTick.price === 'number' && activeTick.price > 0) {
            const tickDate = activeTick.as_of.slice(0, 10);
            setChartData((prev) => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              const lastIdx = next.length - 1;
              if (next[lastIdx].time === tickDate) {
                next[lastIdx] = { time: tickDate, value: Number(activeTick.price) };
              } else {
                next.push({ time: tickDate, value: Number(activeTick.price) });
              }
              return next;
            });
          }
        },
        (err: any) => {
          if (!isMounted) return;
          setTransportStatus(
            err?.code === 'AUTH_REQUIRED' || err?.code === 'AUTH_EXPIRED' ? err.code : 'RECONNECTING'
          );
        }
      );
    } else {
      setTransportStatus(authed ? 'STANDBY' : 'AUTH_REQUIRED');
    }

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [watchlistSymbols, selectedSymbol]);

  const handleSelectSymbol = (sym: string) => {
    setSelectedSymbol(sym);
    fetchChart(sym, selectedRange);
  };

  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    fetchChart(selectedSymbol, range);
  };

  const hasPortfolioData = portfolio && portfolio.status !== 'unavailable' && typeof portfolio.current_value === 'number';
  const totalPnlPositive = (portfolio?.total_pnl ?? 0) >= 0;
  const activeQuote = watchlistQuotes[selectedSymbol];
  const observedAt = activeQuote?.exchange_timestamp || activeQuote?.as_of;
  const observationAge = clock - Date.parse(observedAt || '');
  const canShowLive = transportStatus === 'CONNECTED' &&
    activeQuote?.connection_status === 'CONNECTED' && activeQuote?.freshness === 'LIVE' &&
    observationAge >= -15_000 && observationAge <= 60_000;
  const quoteFreshness = canShowLive
    ? 'LIVE'
    : activeQuote?.freshness === 'LIVE'
      ? 'STALE'
      : activeQuote?.freshness || 'UNAVAILABLE';
  const streamStatus = transportStatus === 'CONNECTED' ? quoteFreshness : transportStatus;
  const activePriceAvailable = activeQuote && activeQuote.status !== 'unavailable' && typeof activeQuote.price === 'number';
  const activeChangePct = activeQuote?.change_percent ?? 0;
  const isUp = activeChangePct >= 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
      {IS_DEMO_MODE && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>DEMO DATA MODE ENABLED — Explicitly flagged test fixtures may appear when live sources are absent.</span>
        </div>
      )}

      {/* ── ABOVE THE FOLD SECTION (1440x900 Optimized) ────────────────── */}

      {/* 1. Market Telemetry & Benchmarks Strip */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              NSE Market Telemetry
            </h2>
            <Badge
              variant={
                overview?.is_market_open ||
                overview?.market_session === 'REGULAR' ||
                overview?.market_session === 'SPECIAL_SESSION'
                  ? 'emerald'
                  : 'neutral'
              }
              size="sm"
            >
              Session: {overview?.market_session || (overview?.is_market_open ? 'REGULAR (09:15-15:30 IST)' : 'CLOSED')}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Wifi
              className={`w-3.5 h-3.5 ${
                streamStatus === 'LIVE'
                  ? 'text-emerald-500'
                  : streamStatus === 'RECONNECTING'
                  ? 'text-amber-500 animate-pulse'
                  : 'text-slate-400'
              }`}
            />
            <span>
              Feed:{' '}
              <strong
                className={
                  streamStatus === 'LIVE'
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : streamStatus === 'RECONNECTING'
                    ? 'text-amber-600 dark:text-amber-400 font-bold'
                    : ''
                }
              >
                {streamStatus.replaceAll('_', ' ')}
              </strong>
            </span>
            {observedAt && <span>• Quote as of {formatIst(observedAt)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {indices.length === 0 ? (
            <Card size="standard" className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500 py-3">
              {loading ? 'Loading benchmark indices...' : 'Benchmark indices unavailable from market feed.'}
            </Card>
          ) : (
            indices.map((idx) => {
              const unavailable = idx.status === 'unavailable' || idx.value === null;
              const isPositive = (idx.change ?? 0) >= 0;
              return (
                <Card key={idx.name} size="standard" className="flex flex-col justify-between py-2.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-caption font-medium text-slate-500 dark:text-slate-400 truncate">
                      {idx.name}
                    </span>
                    <FreshnessBadge
                      status={idx.freshness || 'UNAVAILABLE'}
                      asOf={idx.as_of}
                      source={idx.source}
                    />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {unavailable ? 'Unavailable' : idx.value?.toLocaleString('en-IN')}
                    </span>
                    {!unavailable && typeof idx.change === 'number' && (
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {idx.change} ({isPositive ? '+' : ''}
                        {idx.change_percent}%)
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 text-[10px] text-slate-400 truncate">
                    {unavailable ? idx.reason || 'Unavailable' : `Source: ${idx.source} • ${formatIst(idx.as_of)}`}
                  </span>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {/* 2. Interactive Focus Chart Card */}
      <Card size="large" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/[0.06] pb-3">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {selectedSymbol}
              </span>
              <Badge variant="indigo" size="sm">
                NSE Equity
              </Badge>
              <FreshnessBadge
                status={quoteFreshness}
                asOf={observedAt}
                source={activeQuote?.source ?? null}
              />
            </div>
            <div className="mt-1 flex items-baseline space-x-3">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {activePriceAvailable
                  ? `₹${Number(activeQuote.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                  : 'Awaiting Quote'}
              </span>
              {activePriceAvailable && typeof activeQuote.change_percent === 'number' && (
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {activeChangePct.toFixed(2)}% Today
                </span>
              )}
              {activeQuote?.as_of && (
                <span className="text-[11px] text-slate-400">
                  Observed: {formatIst(activeQuote.as_of)}
                </span>
              )}
            </div>
          </div>

          {/* Chart Period Selector Buttons */}
          <div className="flex items-center space-x-1.5 self-start sm:self-auto">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRangeChange(r)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  selectedRange === r
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
            <Link href={`/stocks/${selectedSymbol}`}>
              <Button variant="outline" size="sm" className="ml-2">
                Full Analysis <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Financial Chart Canvas */}
        <div>
          {chartData.length > 0 ? (
            <FinancialChart data={chartData} height={260} isPositive={isUp} />
          ) : (
            <div className="h-[260px] rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-sm text-slate-500">
              <span>{chartStatus.reason || 'Chart data loading...'}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Historical series: {selectedSymbol} ({selectedRange}) • Daily close</span>
            <span>Source: {chartStatus.source || 'yfinance'} • Not investment advice</span>
          </div>
        </div>
      </Card>

      {/* 3. Personal Watchlist Tape Strip */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Personal Watchlist Tape (Click to chart)
            </h3>
            <Badge variant="neutral" size="sm">
              {watchlistSymbols.length} Symbols
            </Badge>
          </div>
          <Link href="/watchlist" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            Manage Watchlist →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {watchlistSymbols.map((sym) => {
            const q = watchlistQuotes[sym];
            const available = q && q.status !== 'unavailable' && typeof q.price === 'number';
            const chgPct = q?.change_percent ?? 0;
            const isSelected = selectedSymbol === sym;

            return (
              <div
                key={sym}
                onClick={() => handleSelectSymbol(sym)}
                className={`p-3 rounded-card border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/20'
                    : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] hover:border-indigo-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{sym}</span>
                  <FreshnessBadge status={q?.freshness || 'UNAVAILABLE'} asOf={q?.as_of} source={q?.source ?? null} />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {available ? `₹${Number(q.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                  </span>
                  {available && typeof q.change_percent === 'number' && (
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        chgPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {chgPct >= 0 ? '+' : ''}
                      {chgPct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-400 truncate">
                  {available ? `${q.source} • ${formatIst(q.as_of)}` : 'Awaiting quote'}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── BELOW THE FOLD SECTION (Portfolio & Paper Trading Ledger) ──── */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        {/* Portfolio & Paper Blotter Card */}
        <Card size="large" className="lg:col-span-2 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/[0.06] pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  Portfolio &amp; Paper Blotter
                </h2>
                <Badge variant="indigo" size="sm">
                  PAPER TRADING (Simulated)
                </Badge>
              </div>
              <div className="mt-2 flex items-baseline space-x-3">
                <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {hasPortfolioData
                    ? `₹${Number(portfolio.current_value).toLocaleString('en-IN')}`
                    : isAuthenticated
                    ? 'No live broker portfolio holdings'
                    : 'Sign in to view account'}
                </span>
                {hasPortfolioData && typeof portfolio.total_pnl === 'number' && (
                  <span
                    className={`flex items-center text-sm font-medium tabular-nums ${
                      totalPnlPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {totalPnlPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                    {totalPnlPositive ? '+' : ''}
                    ₹{Math.abs(portfolio.total_pnl).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              {paperSummary && (
                <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  PAPER LEDGER: {paperSummary.count} simulated orders ({paperSummary.openCount} open) • Filled Notional ₹
                  {paperSummary.filledNotional.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <div className="flex space-x-2">
              <Link href="/orders">
                <Button variant="primary" size="sm">
                  Paper Order Blotter
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="outline" size="sm">
                  Portfolio Details
                </Button>
              </Link>
            </div>
          </div>

          {/* Performance Metrics (Verified API data or explicit Unavailable) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
              <span className="text-caption text-slate-500 font-medium">Win Rate</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.win_rate === 'number' ? `${performance.win_rate}%` : 'Unavailable'}
              </p>
              <span className="text-[10px] text-slate-400">Closed paper trades</span>
            </div>
            <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
              <span className="text-caption text-slate-500 font-medium">Profit Factor</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.profit_factor === 'number' ? performance.profit_factor : 'Unavailable'}
              </p>
              <span className="text-[10px] text-slate-400">Gross wins / gross losses</span>
            </div>
            <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
              <span className="text-caption text-slate-500 font-medium">Annualised CAGR</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.cagr === 'number' ? `${performance.cagr}%` : 'Unavailable'}
              </p>
              <span className="text-[10px] text-slate-400">Compounded return</span>
            </div>
            <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
              <span className="text-caption text-slate-500 font-medium">Max Drawdown</span>
              <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                {typeof performance?.max_drawdown === 'number' ? `${performance.max_drawdown}%` : 'Unavailable'}
              </p>
              <span className="text-[10px] text-slate-400">Peak-to-trough decline</span>
            </div>
          </div>
        </Card>

        {/* Market Breadth & Flow Context Card */}
        <div className="space-y-4">
          <Card size="standard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Market Breadth &amp; Flows
                </h3>
              </div>
              <Badge variant="neutral" size="sm">NSE</Badge>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">Advance / Decline</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {overview?.advance_decline?.status === 'ok'
                    ? `${overview.advance_decline.advances} Adv / ${overview.advance_decline.declines} Dec`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">FII Net Cash</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {overview?.fii_activity?.status === 'unavailable' || overview?.fii_activity?.net_cr === null
                    ? 'Unavailable'
                    : `₹${overview?.fii_activity?.net_cr} Cr`}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">DII Net Cash</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {overview?.dii_activity?.status === 'unavailable' || overview?.dii_activity?.net_cr === null
                    ? 'Unavailable'
                    : `₹${overview?.dii_activity?.net_cr} Cr`}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-slate-400">
              Flow data published daily by NSE EOD reports. Not intraday signals.
            </p>
          </Card>

          {/* AI Deterministic Picks */}
          <Card size="standard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Deterministic Quant Signals
                </h3>
              </div>
              <Badge variant="emerald" size="sm">Rule v1.0</Badge>
            </div>

            {aiPicks.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No active quant signals generated for current filter thresholds.
              </p>
            ) : (
              <div className="space-y-2">
                {aiPicks.slice(0, 3).map((pick: any) => (
                  <Link key={pick.symbol} href={`/stocks/${pick.symbol}`}>
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-xs transition-colors">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{pick.symbol}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={pick.signal?.toLowerCase() === 'buy' ? 'emerald' : 'amber'} size="sm">
                          {pick.signal} ({pick.confidence}%)
                        </Badge>
                        <span className="text-[11px] text-slate-400">Target ₹{pick.target}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-slate-400">
              Rules: 20/50 SMA trend, 14-period RSI band, MACD expansion, volume surge. Not investment advice.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
