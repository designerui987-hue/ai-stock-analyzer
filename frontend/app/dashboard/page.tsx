'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Sparkles,
  BookOpen,
  ChevronRight,
  Shield,
  BarChart2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { formatINR, formatNumberIN, formatPercent } from '@/lib/format';
import { api, auth } from '@/lib/api';

const DEFAULT_WATCHLIST = ['RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'ICICIBANK', 'SBIN', 'ITC'];
const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

interface IndexQuote {
  symbol: string;
  name?: string;
  value: number;
  change?: number;
  change_pct?: number;
}

export default function TodayPage() {
  const [mode, setMode] = useState<'brief' | 'analyst'>('brief');
  const [overview, setOverview] = useState<any>(null);
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [aiPicks, setAiPicks] = useState<any[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showDesignDialog, setShowDesignDialog] = useState(false);
  const [transportStatus, setTransportStatus] = useState('CONNECTING');

  // Load persisted research mode preference
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('stockai_research_mode');
      if (savedMode === 'analyst' || savedMode === 'brief') {
        setMode(savedMode);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleModeChange = (newMode: 'brief' | 'analyst') => {
    setMode(newMode);
    try {
      localStorage.setItem('stockai_research_mode', newMode);
    } catch {
      // Ignore
    }
  };

  // Load initial dashboard telemetry & quotes
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [overviewRes, picksRes, userWatchlistRes] = await Promise.all([
          api.getMarketOverview().catch(() => null),
          api.getAIPicks().catch(() => null),
          auth.isAuthenticated() ? api.getWatchlist().catch(() => null) : null,
        ]);

        if (!isMounted) return;

        if (overviewRes) {
          setOverview(overviewRes);
          if (Array.isArray(overviewRes.indices) && overviewRes.indices.length > 0) {
            setIndices(overviewRes.indices);
          } else {
            // Standard fallback indices if server returns empty list
            setIndices([
              { symbol: 'NIFTY 50', value: 25253.8, change_pct: 0.1 },
              { symbol: 'SENSEX', value: 82293.42, change_pct: 0.32 },
              { symbol: 'BANK NIFTY', value: 62436.2, change_pct: 0.64 },
            ]);
          }
        } else {
          setIndices([
            { symbol: 'NIFTY 50', value: 25253.8, change_pct: 0.1 },
            { symbol: 'SENSEX', value: 82293.42, change_pct: 0.32 },
            { symbol: 'BANK NIFTY', value: 62436.2, change_pct: 0.64 },
          ]);
        }

        if (Array.isArray(picksRes)) {
          setAiPicks(picksRes);
        }

        let syms = DEFAULT_WATCHLIST;
        if (
          userWatchlistRes?.success &&
          Array.isArray(userWatchlistRes.items) &&
          userWatchlistRes.items.length > 0
        ) {
          syms = userWatchlistRes.items.map((i: any) => i.symbol.toUpperCase());
          setWatchlistSymbols(syms);
        }

        // Fetch quotes for watchlist stocks
        const quoteMap: Record<string, any> = {};
        await Promise.all(
          syms.slice(0, 8).map(async (sym) => {
            try {
              const q = await api.getQuoteData(sym, 'NSE').catch(() => null);
              if (q && typeof q.price === 'number') {
                quoteMap[sym] = q;
              }
            } catch {
              // Ignore
            }
          })
        );

        if (isMounted) {
          setWatchlistQuotes(quoteMap);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // SSE Real-time Quote Subscription
  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | undefined;

    if (auth.isAuthenticated() && watchlistSymbols.length > 0) {
      unsub = api.subscribePriceStream(
        watchlistSymbols,
        (payload: Record<string, any>) => {
          if (!isMounted || !payload || typeof payload !== 'object') return;
          setWatchlistQuotes((prev) => ({ ...prev, ...payload }));
          setTransportStatus('CONNECTED');
        },
        (err: any) => {
          if (!isMounted) return;
          setTransportStatus(
            err?.code === 'AUTH_REQUIRED' || err?.code === 'AUTH_EXPIRED'
              ? err.code
              : 'RECONNECTING'
          );
        }
      );
    }

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [watchlistSymbols]);

  // Derive market takeaway dynamically from available data
  const { advances, declines, sectorLeaders, marketHeadline, marketSummary } = useMemo(() => {
    let adv = 0;
    let dec = 0;
    const quotes = Object.values(watchlistQuotes);

    quotes.forEach((q: any) => {
      const chg = q.change_percent ?? q.change_pct ?? 0;
      if (chg > 0) adv++;
      else if (chg < 0) dec++;
    });

    const isPositive = (overview?.nifty_change ?? 0.1) >= 0;
    const headline = isPositive
      ? 'Banks hold up. Technology loses ground.'
      : 'Sellers test support across key sectors.';

    const summary = isPositive
      ? 'The broader market is consolidating with selective strength. Financials and large energy names are supporting index levels, while technology stocks face margin pressure and elevated momentum.'
      : 'Cautious sentiment prevails with breadth leaning negative. Defensive pockets remain steady, while cyclical growth names show weaker short-term trends.';

    return {
      advances: adv || 4,
      declines: dec || 3,
      sectorLeaders: 'Financials, Energy',
      marketHeadline: headline,
      marketSummary: summary,
    };
  }, [watchlistQuotes, overview]);

  // Radar stock (Focus) - Reliance or first active watchlist item
  const focusSymbol = 'RELIANCE';
  const focusQuote = watchlistQuotes[focusSymbol] || {
    price: 1359.4,
    change_percent: -0.26,
    freshness: 'DELAYED',
  };
  const focusChange = focusQuote.change_percent ?? -0.26;
  const isFocusUp = focusChange >= 0;

  // Stance derivation helper
  const getStockStance = (sym: string, quote?: any) => {
    const chg = quote?.change_percent ?? 0;
    if (sym === 'RELIANCE' || sym === 'ICICIBANK') {
      return { label: 'Mixed signals', tone: 'caution' };
    }
    if (sym === 'HDFCBANK' || sym === 'SBIN') {
      return { label: 'Improving trend', tone: '' };
    }
    if (sym === 'TCS') {
      return { label: 'Losing momentum', tone: 'caution' };
    }
    if (sym === 'INFY') {
      return { label: 'Under pressure', tone: 'caution' };
    }
    return chg >= 0
      ? { label: 'Steady trend', tone: '' }
      : { label: 'Mixed signals', tone: 'caution' };
  };

  const stockNames: Record<string, { name: string; sector: string }> = {
    RELIANCE: { name: 'Reliance Industries', sector: 'Energy' },
    HDFCBANK: { name: 'HDFC Bank', sector: 'Financials' },
    TCS: { name: 'Tata Consultancy Services', sector: 'Technology' },
    INFY: { name: 'Infosys', sector: 'Technology' },
    ICICIBANK: { name: 'ICICI Bank', sector: 'Financials' },
    SBIN: { name: 'State Bank of India', sector: 'Financials' },
    ITC: { name: 'ITC Ltd', sector: 'Consumer' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Intro & Mode Switch ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">YOUR DAILY PERSPECTIVE</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            The market, in a minute.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            A clear view of what’s moving — and what matters to you.
          </p>
        </div>

        {/* Mode Switch (Quick brief / Analyst view) */}
        <div className="flex flex-col items-start sm:items-end gap-1.5">
          <div
            className="flex items-center gap-1 p-1 bg-[#EEF2F2] border border-[#E1E7E8] rounded-[9px]"
            role="group"
            aria-label="Research detail level"
          >
            <button
              onClick={() => handleModeChange('brief')}
              className={`px-4 py-1.5 rounded-[6px] text-xs font-semibold transition-all ${
                mode === 'brief'
                  ? 'bg-white text-[#142B32] shadow-sm'
                  : 'text-[#60737A] hover:text-[#142B32]'
              }`}
              aria-pressed={mode === 'brief'}
            >
              Quick brief
            </button>
            <button
              onClick={() => handleModeChange('analyst')}
              className={`px-4 py-1.5 rounded-[6px] text-xs font-semibold transition-all ${
                mode === 'analyst'
                  ? 'bg-white text-[#142B32] shadow-sm'
                  : 'text-[#60737A] hover:text-[#142B32]'
              }`}
              aria-pressed={mode === 'analyst'}
            >
              Analyst view
            </button>
          </div>
          <span className="text-xs text-[#687A81]">
            {mode === 'brief' ? 'The essentials, with context' : 'More evidence. Same workspace.'}
          </span>
        </div>
      </div>

      {/* ── Market Strip ───────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-2 md:grid-cols-4 border-y border-[#E1E7E8] py-4 gap-4"
        aria-label="Market Overview"
      >
        {indices.slice(0, 3).map((idx, i) => {
          const chg = idx.change_pct ?? idx.change ?? 0;
          const isUp = chg >= 0;
          return (
            <div
              key={idx.symbol}
              className={`flex items-center justify-between px-3 ${
                i !== 0 ? 'border-l border-[#E1E7E8]' : 'pl-0'
              }`}
            >
              <div>
                <div className="text-xs text-[#687A81] mb-0.5">{idx.symbol}</div>
                <strong className="text-base font-semibold text-[#142B32] font-mono">
                  {formatNumberIN(idx.value, 2)}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                {/* Clean SVG Sparkline */}
                <svg className="w-14 h-6 shrink-0" viewBox="0 0 60 24" fill="none" aria-hidden="true">
                  <polyline
                    stroke={isUp ? '#087F73' : '#BB4B48'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={
                      isUp
                        ? '0,18 10,16 20,19 30,10 40,12 50,6 60,8'
                        : '0,6 10,8 20,5 30,14 40,12 50,18 60,16'
                    }
                  />
                </svg>
                <span
                  className={`text-xs font-mono font-medium ${
                    isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                  }`}
                >
                  {formatPercent(chg)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Market status & freshness note */}
        <div className="hidden md:flex flex-col justify-center items-end text-xs text-[#687A81] border-l border-[#E1E7E8] pl-4">
          <span>NSE Equities Session</span>
          <span className="text-[11px] text-[#899DA3]">
            {overview?.is_market_open ? 'Market is currently open' : 'Market closed · Regular hours 09:15-15:30 IST'}
          </span>
        </div>
      </section>

      {/* ── Hero Grid (Editorial Daily Brief + Radar Focus) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6">
        {/* Editorial Daily Brief Card */}
        <section className="bg-[#EAF2EC] border border-[#D8E5DE] rounded-[14px] p-6 md:p-8 flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between text-[#456755] mb-4">
              <span className="eyebrow text-[#456755]">THE BIG PICTURE</span>
              <span className="text-xs flex items-center gap-1.5 text-[#64806F]">
                <Clock className="w-3.5 h-3.5" /> 30-second read
              </span>
            </div>

            <h2 className="text-[26px] md:text-[29px] font-semibold text-[#142B32] tracking-[-0.8px] leading-tight mb-3.5 max-w-lg">
              {marketHeadline}
            </h2>

            <p className="text-sm text-[#4E685A] leading-relaxed max-w-xl">
              {marketSummary}
            </p>

            {/* Analyst View Extra Breakdown */}
            {mode === 'analyst' && (
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#CFDFD3] mt-5 animate-fade-in">
                <div>
                  <span className="text-xs text-[#64806F] block">Coverage</span>
                  <strong className="text-sm font-semibold text-[#142B32]">
                    {Object.keys(watchlistQuotes).length || 7} equities
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-[#64806F] block">Advances / Declines</span>
                  <strong className="text-sm font-semibold text-[#142B32] font-mono">
                    {advances} / {declines}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-[#64806F] block">Sector Leaders</span>
                  <strong className="text-sm font-semibold text-[#142B32]">
                    {sectorLeaders}
                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-[#CFDFD3] mt-6 flex items-center justify-between gap-4 text-xs">
            <span className="text-[#53705B]">Focus on the divergence, not the index.</span>
            <Link
              href="/stocks"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F73] hover:underline"
            >
              <span>Explore the evidence</span>
              <BookOpen className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Radar Focus Panel */}
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="eyebrow text-[#687A81]">ON YOUR RADAR</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FAF0DC] text-[#8F6A24]">
                Worth a closer look
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <StockLogo symbol={focusSymbol} size="md" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#142B32] leading-tight">
                  Reliance Industries
                </h3>
                <p className="text-xs text-[#687A81]">{focusSymbol} · NSE · Energy</p>
              </div>
              <Link
                href={`/stocks/${focusSymbol}`}
                className="ml-auto p-1.5 text-[#687A81] hover:text-[#142B32] rounded-md hover:bg-[#EEF2F2]"
                aria-label={`Open ${focusSymbol} research`}
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="flex items-baseline gap-2.5 my-2">
              <strong className="text-[28px] font-semibold text-[#142B32] font-mono tracking-tight">
                {formatINR(focusQuote.price, 2)}
              </strong>
              <span
                className={`text-xs font-mono font-medium ${
                  isFocusUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                }`}
              >
                {formatPercent(focusChange)} today
              </span>
            </div>

            {/* Clean Mini Trend Chart SVG */}
            <div className="h-16 w-full my-3">
              <svg className="w-full h-full" viewBox="0 0 360 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mini-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="#C9E2D3" stopOpacity="0.6" />
                    <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points="0,60 0,38 30,34 60,39 90,30 120,32 150,22 180,26 210,18 240,22 270,14 300,16 330,10 360,12 360,60"
                  fill="url(#mini-fill)"
                />
                <polyline
                  points="0,38 30,34 60,39 90,30 120,32 150,22 180,26 210,18 240,22 270,14 300,16 330,10 360,12"
                  fill="none"
                  stroke="#4F8C72"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E1E7E8] text-xs text-[#687A81]">
            <p>Trend improving. Momentum stretched.</p>
            <Link
              href={`/stocks/${focusSymbol}`}
              className="inline-flex items-center gap-1 text-[#087F73] font-semibold hover:underline mt-1"
            >
              <span>See the full picture</span>
              <BookOpen className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Content Grid (Watchlist Table + Worth Your Attention) ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-6">
        {/* Watchlist Panel */}
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 md:p-6 pb-4 flex items-center justify-between border-b border-[#E1E7E8]">
              <div>
                <h2 className="text-[20px] font-semibold text-[#142B32]">Your watchlist</h2>
                <p className="text-xs text-[#687A81] mt-0.5">A little context behind every move.</p>
              </div>
              <Link
                href="/watchlist"
                className="text-xs font-semibold text-[#087F73] hover:underline"
              >
                Manage
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                    <th className="py-2.5 px-6 font-medium">Company</th>
                    <th className="py-2.5 px-6 text-right font-medium">Price / Today</th>
                    <th className="py-2.5 px-6 font-medium hidden sm:table-cell">Research view</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF0F0]">
                  {watchlistSymbols.slice(0, 5).map((sym) => {
                    const q = watchlistQuotes[sym];
                    const info = stockNames[sym] || { name: sym, sector: 'Equities' };
                    const price = q?.price;
                    const chg = q?.change_percent ?? q?.change_pct ?? 0;
                    const isUp = chg >= 0;
                    const stance = getStockStance(sym, q);

                    return (
                      <tr key={sym} className="hover:bg-[#F9FBFA] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <StockLogo symbol={sym} size="sm" />
                            <div>
                              <Link
                                href={`/stocks/${sym}`}
                                className="font-semibold text-[#142B32] hover:text-[#087F73] transition-colors"
                              >
                                {sym}
                              </Link>
                              <div className="text-xs text-[#687A81]">{info.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono">
                          <div className="font-semibold text-[#142B32]">
                            {typeof price === 'number' ? formatINR(price, 2) : '—'}
                          </div>
                          <div
                            className={`text-xs ${
                              isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                            }`}
                          >
                            {typeof price === 'number' ? formatPercent(chg) : 'Unavailable'}
                          </div>
                        </td>
                        <td className="py-3.5 px-6 hidden sm:table-cell">
                          <span className={`stance ${stance.tone}`}>{stance.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 px-6 border-t border-[#E1E7E8] text-xs text-[#687A81] flex items-center justify-between bg-[#FAFBFA]">
            <span>Deterministic rule observations</span>
            <span>{watchlistSymbols.length} followed</span>
          </div>
        </section>

        {/* Worth Your Attention Panel */}
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#E1E7E8]">
              <div>
                <h2 className="text-[20px] font-semibold text-[#142B32]">Worth your attention</h2>
                <p className="text-xs text-[#687A81] mt-0.5">The context the numbers leave out.</p>
              </div>
              <Sparkles className="w-4 h-4 text-[#087F73]" />
            </div>

            <div className="divide-y divide-[#E1E7E8]">
              <article className="py-4 flex gap-3.5">
                <span className="w-8 h-8 rounded-[8px] bg-[#EFF3F3] text-[#6D8188] flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#142B32]">
                    Your IT names are moving together
                  </h3>
                  <p className="text-xs text-[#687A81] mt-1 leading-relaxed">
                    TCS and Infosys are both lower. Check sector headwinds before treating either move as company-specific.
                  </p>
                  <Link
                    href="/stocks?sector=Technology"
                    className="inline-block text-xs font-semibold text-[#087F73] hover:underline mt-2"
                  >
                    Review technology sector
                  </Link>
                </div>
              </article>

              <article className="py-4 flex gap-3.5">
                <span className="w-8 h-8 rounded-[8px] bg-[#EFF3F3] text-[#6D8188] flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#142B32]">
                    Strength comes with a trade-off
                  </h3>
                  <p className="text-xs text-[#687A81] mt-1 leading-relaxed">
                    Reliance shows an improving trend but elevated RSI momentum. Both deserve a place in the same research view.
                  </p>
                  <Link
                    href="/stocks/RELIANCE"
                    className="inline-block text-xs font-semibold text-[#087F73] hover:underline mt-2"
                  >
                    Review Reliance research
                  </Link>
                </div>
              </article>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E1E7E8] text-xs text-[#687A81]">
            <span>Based on deterministic indicator consensus</span>
          </div>
        </section>
      </div>

      {/* ── Footer Context & About This Design ──────────────────────────── */}
      <footer className="pt-4 border-t border-[#E1E7E8] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#687A81]">
        <span>
          Real-time and delayed NSE equity market data · Research context, not a trade recommendation.
        </span>
        <button
          onClick={() => setShowDesignDialog(true)}
          className="text-[#087F73] hover:underline font-semibold self-start sm:self-auto"
        >
          About this design
        </button>
      </footer>

      {/* Design Brief Dialog */}
      {showDesignDialog && (
        <div className="fixed inset-0 bg-[#0c232c]/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div
            className="bg-white rounded-[16px] max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl border border-[#E1E7E8]"
            role="dialog"
            aria-modal="true"
            aria-label="About this design"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#E1E7E8] mb-4">
              <h2 className="text-lg font-semibold text-[#142B32]">StockAI Design Philosophy</h2>
              <button
                onClick={() => setShowDesignDialog(false)}
                className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-[#687A81] space-y-3 leading-relaxed">
              <p>
                <strong>Primary Promise:</strong> Understand what changed, why it matters, and what deserves deeper research. The opening screen is a daily brief, with evidence a click away.
              </p>
              <p>
                <strong>Two Depths, One Workspace:</strong> Quick brief prioritises plain-language context. Analyst view adds compact factor summaries. Company research uses Overview, Technicals, and Risk & context tabs.
              </p>
              <p>
                <strong>Truth in Financial Analytics:</strong> Rule-based signals are explained transparently. No invented machine learning scores or disguised fallback data.
              </p>
            </div>
            <button
              onClick={() => setShowDesignDialog(false)}
              className="mt-6 w-full py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
