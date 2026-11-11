'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  Bell,
  Briefcase,
  BarChart3,
  Cpu,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { api, auth } from '@/lib/api';

const WATCHLIST_SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'];
const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

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

  // Real market overview & chart state (zero fake fixtures)
  const [overview, setOverview] = React.useState<any>(null);
  const [indices, setIndices] = React.useState<any[]>([]);
  const [chartData, setChartData] = React.useState<Array<{ time: string; value: number }>>([]);
  const [chartStatus, setChartStatus] = React.useState<{ ok: boolean; reason?: string; source?: string; asOf?: string | null }>({
    ok: false,
    reason: 'Loading NIFTY 50 chart series...',
  });

  // Live SSE watchlist quotes applied directly to React state
  const [watchlistQuotes, setWatchlistQuotes] = React.useState<Record<string, any>>({});
  const [streamStatus, setStreamStatus] = React.useState<string>('CONNECTING');
  const [lastStreamUpdate, setLastStreamUpdate] = React.useState<string | null>(null);

  // Real portfolio & separated paper ledger state
  const [portfolio, setPortfolio] = React.useState<any>(null);
  const [performance, setPerformance] = React.useState<any>(null);
  const [paperSummary, setPaperSummary] = React.useState<{ count: number; openCount: number; filledNotional: number } | null>(null);

  // Real deterministic signals & user alerts
  const [aiPicks, setAiPicks] = React.useState<any[]>([]);
  const [alerts, setAlerts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const authed = auth.isAuthenticated();
    setIsAuthenticated(authed);

    async function loadDashboard() {
      try {
        const [overviewRes, chartRes, picksRes] = await Promise.all([
          api.getMarketOverview().catch(() => null),
          api.getChartData('RELIANCE', '3M').catch(() => null),
          api.getAIPicks().catch(() => null),
        ]);

        if (!isMounted) return;

        if (overviewRes) {
          setOverview(overviewRes);
          if (Array.isArray(overviewRes.indices)) {
            setIndices(overviewRes.indices);
          }
        }

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
          setChartStatus({
            ok: false,
            reason: 'Historical OHLCV chart series unavailable from backend.',
          });
        }

        if (Array.isArray(picksRes)) {
          setAiPicks(picksRes);
        }

        if (authed) {
          const [portRes, perfRes, alertsRes, paperOrdersRes] = await Promise.all([
            api.getPortfolio().catch(() => null),
            api.getPortfolioPerformance().catch(() => null),
            api.getAlerts().catch(() => null),
            fetch('/api/broker/orders?mode=PAPER', { headers: auth.getAuthHeaders() })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ]);

          if (!isMounted) return;

          if (portRes) setPortfolio(portRes);
          if (perfRes) setPerformance(perfRes);
          if (Array.isArray(alertsRes)) setAlerts(alertsRes);
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
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboard();

    // Real-time / delayed quote SSE subscription with state updates & clean unmount cleanup
    let unsub: (() => void) | undefined;
    if (authed) {
      unsub = api.subscribePriceStream(
        WATCHLIST_SYMBOLS,
        (payload: Record<string, any>) => {
          if (!isMounted || !payload || typeof payload !== 'object') return;
          setWatchlistQuotes((prev) => ({ ...prev, ...payload }));
          setLastStreamUpdate(new Date().toISOString());

          const firstEntry = Object.values(payload)[0];
          if (firstEntry?.connection_status === 'CONNECTED' && firstEntry?.freshness === 'LIVE') {
            setStreamStatus('LIVE');
          } else if (firstEntry?.market_session && firstEntry.market_session !== 'REGULAR' && firstEntry.market_session !== 'SPECIAL_SESSION') {
            setStreamStatus('MARKET_CLOSED');
          } else if (firstEntry?.freshness) {
            setStreamStatus(firstEntry.freshness);
          }

          // Update primary RELIANCE chart point in real time when tick arrives
          const relTick = payload['RELIANCE'];
          if (relTick && typeof relTick.price === 'number' && relTick.price > 0) {
            const tickDate = (relTick.as_of || new Date().toISOString()).slice(0, 10);
            setChartData((prev) => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              const lastIdx = next.length - 1;
              if (next[lastIdx].time === tickDate) {
                next[lastIdx] = { time: tickDate, value: Number(relTick.price) };
              } else {
                next.push({ time: tickDate, value: Number(relTick.price) });
              }
              return next;
            });
          }
        },
        (err: any) => {
          if (!isMounted) return;
          setStreamStatus(err?.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'RECONNECTING');
        }
      );
    } else {
      setStreamStatus('AUTH_REQUIRED');
    }

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, []);

  const hasPortfolioData = portfolio && portfolio.status !== 'unavailable' && typeof portfolio.current_value === 'number';
  const totalPnlPositive = (portfolio?.total_pnl ?? 0) >= 0;
  const indiaVix = indices.find((idx) => idx.name === 'INDIA VIX' || idx.symbol === '^INDIAVIX');
  const breadth = overview?.advance_decline;
  const fii = overview?.fii_activity;
  const dii = overview?.dii_activity;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {IS_DEMO_MODE && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>DEMO DATA MODE ENABLED — Explicitly flagged test fixtures may appear when live sources are absent.</span>
        </div>
      )}

      {/* Top Market Indices */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            NSE / Market Benchmarks {overview?.market_session ? `• Session: ${overview.market_session}` : ''}
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Wifi className="w-3.5 h-3.5" />
            <span>Stream: {streamStatus}</span>
            {lastStreamUpdate && <span>• Last event {formatIst(lastStreamUpdate)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {indices.length === 0 ? (
            <Card size="standard" className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">
              {loading ? 'Loading benchmark indices...' : 'Benchmark indices unavailable from market feed.'}
            </Card>
          ) : (
            indices.map((idx) => {
              const unavailable = idx.status === 'unavailable' || idx.value === null;
              const isPositive = (idx.change ?? 0) >= 0;
              return (
                <Card key={idx.name} size="standard" className="flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-slate-500 dark:text-slate-400">
                      {idx.name}
                    </span>
                    <FreshnessBadge
                      status={idx.freshness || 'UNAVAILABLE'}
                      asOf={idx.as_of}
                      source={idx.source}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {unavailable ? 'Unavailable' : Number(idx.value).toLocaleString('en-IN')}
                    </span>
                    {!unavailable && idx.change_percent !== null && (
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
                  <span className="mt-1 text-[11px] text-slate-400">
                    {unavailable ? idx.reason || 'Unavailable' : `Source: ${idx.source} • ${formatIst(idx.as_of)}`}
                  </span>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {/* Live Watchlist Stream Strip */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Live Watchlist Tape
          </h3>
          {!isAuthenticated && (
            <Link href="/login" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              Sign in to stream per-user quotes
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {WATCHLIST_SYMBOLS.map((sym) => {
            const q = watchlistQuotes[sym];
            const available = q && q.status !== 'unavailable' && typeof q.price === 'number';
            const chgPct = q?.change_percent ?? 0;
            return (
              <Link key={sym} href={`/stocks/${sym}`}>
                <Card size="standard" className="hover:border-indigo-500/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{sym}</span>
                    <FreshnessBadge status={q?.freshness || 'UNAVAILABLE'} asOf={q?.as_of} source={q?.source} />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {available ? `₹${Number(q.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unavailable'}
                    </span>
                    {available && typeof q.change_percent === 'number' && (
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          chgPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {chgPct >= 0 ? '+' : ''}
                        {chgPct}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 truncate">
                    {available ? `${q.source} • ${formatIst(q.as_of)}` : q?.reason || 'Awaiting tick'}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Main Two-Column Analytical Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card size="large" className="lg:col-span-2 flex flex-col justify-between space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  Portfolio &amp; Paper Ledger
                </h2>
                <Badge variant="neutral">Account &amp; Paper Separated</Badge>
              </div>
              <div className="mt-2 flex items-baseline space-x-3">
                <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {hasPortfolioData
                    ? `₹${Number(portfolio.current_value).toLocaleString('en-IN')}`
                    : isAuthenticated
                    ? 'No broker portfolio holdings'
                    : 'Sign in required'}
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
                <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                  PAPER LEDGER (Simulated): {paperSummary.count} orders ({paperSummary.openCount} open) • Filled Notional ₹
                  {paperSummary.filledNotional.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <Link href="/orders">
                <Button variant="secondary" size="sm">
                  Orders &amp; Paper Trade
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="primary" size="sm">
                  View Portfolio
                </Button>
              </Link>
            </div>
          </div>

          {/* Real RELIANCE Historical Chart + Live Stream Append */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">
                RELIANCE (NSE) 3M Historical Close
              </span>
              {chartStatus.ok && (
                <span className="text-[11px] text-slate-400">
                  Source: {chartStatus.source} • As of {chartStatus.asOf}
                </span>
              )}
            </div>
            {chartData.length > 0 ? (
              <FinancialChart data={chartData} height={260} isPositive={true} />
            ) : (
              <div className="h-[260px] rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-sm text-slate-500">
                <span>{chartStatus.reason || 'Chart data unavailable'}</span>
              </div>
            )}
          </div>

          {/* Account Performance Metrics (strictly from real API or Unavailable) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-caption text-slate-500">Win Rate</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.win_rate === 'number' ? `${performance.win_rate}%` : 'Unavailable'}
              </p>
            </div>
            <div>
              <span className="text-caption text-slate-500">Profit Factor</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.profit_factor === 'number' ? performance.profit_factor : 'Unavailable'}
              </p>
            </div>
            <div>
              <span className="text-caption text-slate-500">CAGR</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.cagr === 'number' ? `${performance.cagr}%` : 'Unavailable'}
              </p>
            </div>
            <div>
              <span className="text-caption text-slate-500">Max Drawdown</span>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {typeof performance?.max_drawdown === 'number' ? `${performance.max_drawdown}%` : 'Unavailable'}
              </p>
            </div>
          </div>
        </Card>

        {/* Market Breadth & Macro Context Column */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-slate-400" />
                <h3 className="text-h3 font-semibold text-slate-900 dark:text-slate-100">
                  Market Breadth &amp; Flows
                </h3>
              </div>
              <Badge variant="neutral">NSE</Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">Constituent Breadth</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {breadth?.status === 'ok'
                    ? `${breadth.advances} Adv / ${breadth.declines} Dec (n=${breadth.sample_size})`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">FII Cash Flow</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {fii?.status === 'unavailable' || fii?.net_cr === null
                    ? 'Unavailable'
                    : `₹${fii?.net_cr} Cr`}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">DII Cash Flow</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {dii?.status === 'unavailable' || dii?.net_cr === null
                    ? 'Unavailable'
                    : `₹${dii?.net_cr} Cr`}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">INDIA VIX</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {indiaVix && indiaVix.status !== 'unavailable' && indiaVix.value !== null
                    ? Number(indiaVix.value).toFixed(2)
                    : 'Unavailable'}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <h3 className="text-h3 font-semibold text-slate-900 dark:text-slate-100">
                  Execution Safeguards
                </h3>
              </div>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>• Live real-money order routing gated behind explicit confirmation.</li>
              <li>• Orders validate server-side quote freshness &amp; observation time.</li>
              <li>• Signals require deterministic rule consensus + completed OHLCV bars.</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Link href="/orders" className="flex-1">
                <Button variant="secondary" size="sm" className="w-full">
                  Order Blotter
                </Button>
              </Link>
              <Link href="/signals" className="flex-1">
                <Button variant="secondary" size="sm" className="w-full">
                  Signal Ledger
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Deterministic Signals & Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-slate-400" />
              <h3 className="text-h3 font-semibold text-slate-900 dark:text-slate-100">
                Deterministic Signals
              </h3>
            </div>
            <Link href="/signals" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Signal Ledger
            </Link>
          </div>

          <div className="space-y-3">
            {aiPicks.length === 0 ? (
              <p className="text-xs text-slate-500">
                {loading ? 'Evaluating deterministic rules...' : 'Signals unavailable — market quotes or OHLCV missing.'}
              </p>
            ) : (
              aiPicks.slice(0, 4).map((pick) => {
                const unavail = pick.status === 'unavailable';
                return (
                  <Link key={pick.symbol} href={`/stocks/${pick.symbol}`}>
                    <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-500/40 transition-colors flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{pick.symbol}</span>
                          {unavail ? (
                            <Badge variant="neutral">UNAVAILABLE</Badge>
                          ) : (
                            <Badge variant={(pick.signal || 'hold').toLowerCase() as any}>
                              {pick.signal}
                            </Badge>
                          )}
                          <FreshnessBadge status={pick.freshness || 'UNAVAILABLE'} asOf={pick.as_of} source={pick.source} />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {unavail
                            ? pick.reason || 'Quote or OHLCV unavailable'
                            : `Target ₹${pick.target} • SL ₹${pick.stop_loss} • Rule: ${pick.rule_version}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {typeof pick.price === 'number' ? `₹${pick.price.toLocaleString('en-IN')}` : '—'}
                        </span>
                        <p className="text-[11px] text-slate-400">
                          {pick.confidence ? `Conf ${pick.confidence}%` : 'Not investment advice'}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-slate-400" />
              <h3 className="text-h3 font-semibold text-slate-900 dark:text-slate-100">
                Alerts
              </h3>
            </div>
            <Link href="/alerts" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Manage Alerts
            </Link>
          </div>
          {!isAuthenticated ? (
            <p className="text-xs text-slate-500">Sign in to load your active price and signal alerts.</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-slate-500">No active alerts configured for this account.</p>
          ) : (
            <div className="space-y-2.5">
              {alerts.slice(0, 4).map((al: any, idx: number) => (
                <div
                  key={al.id || idx}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{al.symbol}</span>
                    <span className="ml-2 text-slate-500">{al.message || al.condition}</span>
                  </div>
                  <Badge variant={al.is_triggered ? 'emerald' : 'neutral'}>
                    {al.is_triggered ? 'Triggered' : 'Active'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Global Regulatory Disclaimer per AGENTS.md Rule 7 */}
      <footer className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>
          All prices and quantitative rule outputs display source and observation timestamp. Not investment advice; equity investments are subject to market risk.
        </span>
        <div className="flex space-x-4">
          <Link href="/backtest" className="hover:underline flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Backtest Engine
          </Link>
          <Link href="/data-sources" className="hover:underline flex items-center gap-1">
            <Briefcase className="w-3 h-3" /> Data Sources
          </Link>
        </div>
      </footer>
    </div>
  );
}
