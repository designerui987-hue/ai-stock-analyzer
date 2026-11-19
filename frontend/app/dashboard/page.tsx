'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  BookOpen,
  ChevronRight,
  Sparkles,
  BarChart2,
  Shield,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  X,
  RefreshCw,
  AlertTriangle,
  Compass,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { formatINR, formatNumberIN, formatPercent } from '@/lib/format';
import { api, auth } from '@/lib/api';
import { evaluateNseSession } from '@/lib/orders/execution';

const NIFTY50_META: Record<string, { name: string; sector: string }> = {
  RELIANCE: { name: 'Reliance Industries Ltd', sector: 'Energy' },
  HDFCBANK: { name: 'HDFC Bank Ltd', sector: 'Financials' },
  TCS: { name: 'Tata Consultancy Services', sector: 'Technology' },
  INFY: { name: 'Infosys Ltd', sector: 'Technology' },
  ICICIBANK: { name: 'ICICI Bank Ltd', sector: 'Financials' },
  SBIN: { name: 'State Bank of India', sector: 'Financials' },
  BHARTIARTL: { name: 'Bharti Airtel Ltd', sector: 'Telecom' },
  ITC: { name: 'ITC Ltd', sector: 'Consumer' },
  LICI: { name: 'Life Insurance Corp', sector: 'Financials' },
  HINDUNILVR: { name: 'Hindustan Unilever', sector: 'Consumer' },
  LT: { name: 'Larsen & Toubro Ltd', sector: 'Industrial' },
  BAJFINANCE: { name: 'Bajaj Finance Ltd', sector: 'Financials' },
  TATAMOTORS: { name: 'Tata Motors Ltd', sector: 'Automobile' },
  KOTAKBANK: { name: 'Kotak Mahindra Bank', sector: 'Financials' },
  AXISBANK: { name: 'Axis Bank Ltd', sector: 'Financials' },
};

interface IndexQuote {
  symbol: string;
  name?: string;
  value: number | null;
  change?: number | null;
  change_percent?: number | null;
  freshness?: string;
  source?: string;
  as_of?: string | null;
  status?: string;
  reason?: string;
}

export default function TodayPage() {
  const [mode, setMode] = useState<'brief' | 'analyst'>('brief');
  const [overview, setOverview] = useState<any>(null);
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[] | null>(null);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, any>>({});
  const [focusChart, setFocusChart] = useState<Array<{ time: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [showDesignDialog, setShowDesignDialog] = useState(false);
  const [transportStatus, setTransportStatus] = useState<'CONNECTING' | 'CONNECTED' | 'STANDBY'>('CONNECTING');
  const [personalizedBrief, setPersonalizedBrief] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Authoritative session evaluation
  const sessionInfo = evaluateNseSession();

  // Load persisted research mode & auto-refresh preferences
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('stockai_research_mode');
      if (savedMode === 'analyst' || savedMode === 'brief') {
        setMode(savedMode);
      }
      const savedAutoRef = localStorage.getItem('stockai_auto_refresh_quotes');
      if (savedAutoRef !== null) {
        setAutoRefresh(savedAutoRef === 'true');
      }
    } catch {
      // Ignore
    }

    const handlePref = (e: any) => {
      if (typeof e.detail?.autoRefresh === 'boolean') {
        setAutoRefresh(e.detail.autoRefresh);
      }
    };
    window.addEventListener('quotes-preference-changed', handlePref);
    return () => window.removeEventListener('quotes-preference-changed', handlePref);
  }, []);

  const handleModeChange = (newMode: 'brief' | 'analyst') => {
    setMode(newMode);
    try {
      localStorage.setItem('stockai_research_mode', newMode);
    } catch {
      // Ignore
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setOverviewError(null);

      const [overviewRes, userWatchlistRes, briefRes] = await Promise.all([
        api.getMarketOverview().catch(() => null),
        auth.isAuthenticated() ? api.getWatchlist().catch(() => null) : null,
        auth.isAuthenticated() ? api.getPersonalizedBrief().catch(() => null) : null,
      ]);

      if (briefRes) {
        setPersonalizedBrief(briefRes);
      }

      if (overviewRes) {
        setOverview(overviewRes);
        if (Array.isArray(overviewRes.indices) && overviewRes.indices.length > 0) {
          setIndices(overviewRes.indices);
        } else {
          setIndices([]);
        }
      } else {
        setOverviewError('Market overview feed is temporarily unavailable.');
      }

      let syms: string[] = [];
      if (userWatchlistRes?.unavailable || userWatchlistRes?.error) {
        setWatchlistError(userWatchlistRes.error || 'Watchlist service is temporarily unavailable.');
      } else if (userWatchlistRes?.success && Array.isArray(userWatchlistRes.items)) {
        setWatchlistError(null);
        syms = userWatchlistRes.items.map((i: any) => i.symbol.toUpperCase());
        setWatchlistSymbols(syms);
      } else if (Array.isArray(userWatchlistRes)) {
        setWatchlistError(null);
        syms = userWatchlistRes.map((i: any) => (typeof i === 'string' ? i : i.symbol).toUpperCase());
        setWatchlistSymbols(syms);
      } else {
        setWatchlistError(null);
        setWatchlistSymbols([]);
      }

      // Fetch quotes for followed stocks
      const quoteMap: Record<string, any> = {};
      const symbolsToFetch = syms.length > 0 ? syms.slice(0, 10) : ['RELIANCE', 'HDFCBANK', 'TCS'];
      await Promise.all(
        symbolsToFetch.map(async (sym) => {
          try {
            const q = await api.getQuoteData(sym, 'NSE').catch(() => null);
            if (q && typeof q.price === 'number') {
              quoteMap[sym] = q;
            }
          } catch {
            // Ignore individual quote errors
          }
        })
      );

      setWatchlistQuotes(quoteMap);

      // Fetch 1M trajectory for focus stock
      const focusSym = syms.length > 0 ? syms[0] : 'RELIANCE';
      try {
        const chartRes = await api.getChartData(focusSym, '1M').catch(() => null);
        if (Array.isArray(chartRes) && chartRes.length > 0) {
          setFocusChart(
            chartRes.map((d: any) => ({
              time: d.date,
              value: Number(d.close),
            }))
          );
        }
      } catch {
        // Ignore chart error
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleWatchlistChange = () => {
      loadData();
    };
    window.addEventListener('watchlist-updated', handleWatchlistChange);
    return () => window.removeEventListener('watchlist-updated', handleWatchlistChange);
  }, [loadData]);

  // Real-time quote stream subscription (respects user auto-refresh preference)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (autoRefresh && auth.isAuthenticated() && watchlistSymbols && watchlistSymbols.length > 0) {
      unsub = api.subscribePriceStream(
        watchlistSymbols,
        (payload: Record<string, any>) => {
          if (!payload || typeof payload !== 'object') return;
          setWatchlistQuotes((prev) => ({ ...prev, ...payload }));
          setTransportStatus('CONNECTED');
        },
        () => {
          setTransportStatus('STANDBY');
        }
      );
    } else {
      setTransportStatus('STANDBY');
    }
    return () => {
      if (unsub) unsub();
    };
  }, [watchlistSymbols, autoRefresh]);

  // Dynamic market takeaway
  const { advances, declines, unchanged, sampleSize, breadthSource, headline, summary } = useMemo(() => {
    let adv = 0;
    let dec = 0;
    let unc = 0;
    let count = 0;
    let src = 'yfinance';

    // Prefer official constituent breadth from overview
    if (overview?.advance_decline && overview.advance_decline.status === 'ok') {
      adv = overview.advance_decline.advances || 0;
      dec = overview.advance_decline.declines || 0;
      unc = overview.advance_decline.unchanged || 0;
      count = overview.advance_decline.sample_size || 0;
      src = overview.advance_decline.source || 'yfinance';
    } else {
      // Compute from actual quotes in memory
      const quotes = Object.values(watchlistQuotes);
      quotes.forEach((q: any) => {
        const chg = q.change_percent ?? q.change_pct;
        if (typeof chg === 'number') {
          count++;
          if (chg > 0) adv++;
          else if (chg < 0) dec++;
          else unc++;
        }
      });
    }

    if (count === 0) {
      return {
        advances: null,
        declines: null,
        unchanged: null,
        sampleSize: 0,
        breadthSource: 'unavailable',
        headline: 'Market session observation in progress.',
        summary:
          'Gathering verified quote feeds for tracked equities. Overview metrics and stance indications will populate as data arrives.',
      };
    }

    const isBreadthPositive = adv >= dec;
    const textHeadline = isBreadthPositive
      ? 'Positive breadth with selective large-cap strength.'
      : 'Sellers maintain pressure across primary sectors.';

    const textSummary = isBreadthPositive
      ? `Market participation tilts constructive with ${adv} advancing and ${dec} declining (${unc} unchanged) across ${count} constituent equities. Large-cap stability supports headline levels while momentum remains selective.`
      : `Broad market indicators show cautious sentiment with ${dec} declining against ${adv} advancing across ${count} constituent equities. Key support zones are being tested; maintain strict risk parameters.`;

    return {
      advances: adv,
      declines: dec,
      unchanged: unc,
      sampleSize: count,
      breadthSource: src,
      headline: textHeadline,
      summary: textSummary,
    };
  }, [overview, watchlistQuotes]);

  // Focus stock for "On Your Radar" derived from ranked radar items if present
  const topRadar = personalizedBrief?.radar_items?.[0];
  const focusSymbol = topRadar?.symbol || (watchlistSymbols && watchlistSymbols.length > 0 ? watchlistSymbols[0] : 'RELIANCE');
  const focusQuote = watchlistQuotes[focusSymbol];
  const focusPrice = topRadar?.price ?? (typeof focusQuote?.price === 'number' ? focusQuote.price : null);
  const focusChange = topRadar?.change_pct ?? (typeof (focusQuote?.change_percent ?? focusQuote?.change_pct) === 'number'
    ? (focusQuote.change_percent ?? focusQuote.change_pct)
    : null);
  const isFocusUp = (focusChange ?? 0) >= 0;
  const focusMeta = NIFTY50_META[focusSymbol] || { name: topRadar?.name || `${focusSymbol} Ltd`, sector: topRadar?.sector || 'Equity' };
  const focusWhy = topRadar?.why || 'Moving averages and volume tracking provide primary support levels.';
  const focusEvidence = topRadar?.evidence || null;
  const focusRisk = topRadar?.risk || null;

  // Data-driven "Worth Your Attention"
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      desc: string;
      linkText: string;
      href: string;
      icon: any;
    }> = [];

    // Prepend secondary ranked radar items if available from personalized brief
    if (Array.isArray(personalizedBrief?.radar_items)) {
      personalizedBrief.radar_items.slice(1, 3).forEach((r: any) => {
        items.push({
          id: `radar-${r.symbol}`,
          title: `${r.symbol}: ${r.title}`,
          desc: `${r.why} ${r.evidence || ''}`,
          linkText: `Investigate ${r.symbol}`,
          href: `/stocks/${encodeURIComponent(r.symbol)}`,
          icon: Compass,
        });
      });
    }

    const entries = Object.entries(watchlistQuotes);

    // 1. Sector movement correlation
    const sectorGroups: Record<string, Array<{ sym: string; chg: number }>> = {};
    entries.forEach(([sym, q]: [string, any]) => {
      const meta = NIFTY50_META[sym];
      const sec = meta?.sector || 'Equities';
      const chg = q?.change_percent ?? q?.change_pct;
      if (typeof chg === 'number') {
        sectorGroups[sec] = sectorGroups[sec] || [];
        sectorGroups[sec].push({ sym, chg });
      }
    });

    for (const [sec, moves] of Object.entries(sectorGroups)) {
      if (moves.length >= 2 && sec !== 'Equities') {
        const allUp = moves.every((m) => m.chg > 0);
        const allDown = moves.every((m) => m.chg < 0);
        if (allUp || allDown) {
          const symNames = moves.map((m) => m.sym).join(' and ');
          items.push({
            id: `sec-${sec}`,
            title: `Your ${sec} names are moving together`,
            desc: `${symNames} are both ${allUp ? 'higher' : 'lower'} today. Check sector-wide macro and regulatory context before treating either move as company-specific.`,
            linkText: `Explore ${sec} sector`,
            href: `/stocks?sector=${encodeURIComponent(sec)}`,
            icon: BarChart2,
          });
          break;
        }
      }
    }

    // 2. Notable mover
    const sortedMovers = [...entries]
      .filter(([_, q]: [string, any]) => typeof (q?.change_percent ?? q?.change_pct) === 'number')
      .sort(
        (a, b) =>
          Math.abs(b[1].change_percent ?? b[1].change_pct) -
          Math.abs(a[1].change_percent ?? a[1].change_pct)
      );

    if (sortedMovers.length > 0) {
      const [topSym, topQ] = sortedMovers[0];
      const chg = topQ.change_percent ?? topQ.change_pct;
      items.push({
        id: `mover-${topSym}`,
        title: `${topSym} leading moves in your workspace`,
        desc: `${topSym} has moved ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% today (${formatINR(
          topQ.price
        )}). Review technical support levels and volume verification.`,
        linkText: `Review ${topSym} research`,
        href: `/stocks/${topSym}`,
        icon: TrendingUp,
      });
    }

    // 3. Technical discipline anchor
    if (items.length < 2) {
      items.push({
        id: 'guidance-risk',
        title: 'Rule-based quantitative discipline',
        desc: 'Deterministic indicators evaluate trend, momentum, and volatility objectively with versioned mathematical formulas.',
        linkText: 'Inspect Signal Ledger',
        href: '/performance',
        icon: Shield,
      });
    }

    return items;
  }, [watchlistQuotes]);

  const getStance = (chg: number | null) => {
    if (chg === null) return { label: 'Quote pending', tone: 'caution' };
    if (chg > 1.5) return { label: 'Strong momentum', tone: '' };
    if (chg > 0) return { label: 'Steady trend', tone: '' };
    if (chg > -1.5) return { label: 'Consolidating', tone: 'caution' };
    return { label: 'Under pressure', tone: 'caution' };
  };

  const followedList = watchlistSymbols || [];
  const displayedWatchlist = followedList.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Intro & Mode Switch ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">YOUR DAILY PERSPECTIVE</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Today.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            The market takeaway first. The supporting evidence on demand.
          </p>
        </div>

        <div className="flex items-center gap-3">
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
          <span className="text-xs text-[#687A81] hidden sm:inline">
            {mode === 'brief' ? 'The essentials, with context' : 'More evidence. Same workspace.'}
          </span>
        </div>
      </div>

      {/* ── Authoritative Market Indices Strip ───────────────────────────── */}
      <section
        className="grid grid-cols-2 md:grid-cols-4 border-y border-[#E1E7E8] py-4 gap-4"
        aria-label="Authoritative market indices"
      >
        {indices.length > 0 ? (
          indices.slice(0, 4).map((idx, i) => {
            const val = idx.value;
            const chg = idx.change_percent ?? idx.change ?? null;
            const isUp = (chg ?? 0) >= 0;
            const isAvail = val !== null && idx.status !== 'unavailable';

            return (
              <div
                key={idx.symbol || i}
                className={`flex items-center justify-between px-3 ${
                  i !== 0 ? 'border-l border-[#E1E7E8]' : 'pl-0'
                }`}
              >
                <div>
                  <div className="text-xs text-[#687A81] mb-0.5 truncate">{idx.name || idx.symbol}</div>
                  {isAvail ? (
                    <strong className="text-base font-semibold text-[#142B32] font-mono block">
                      {formatNumberIN(val, 2)}
                    </strong>
                  ) : (
                    <span className="text-xs font-semibold text-[#8B734D] block">Unavailable</span>
                  )}
                  {idx.as_of && (
                    <span className="text-[10px] text-[#899DA3] block">
                      {new Date(idx.as_of).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      IST
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  {isAvail && chg !== null ? (
                    <span
                      className={`text-xs font-mono font-medium flex items-center ${
                        isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                      }`}
                    >
                      {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {formatPercent(chg)}
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-[#899DA3]">—</span>
                  )}
                  {idx.freshness && <FreshnessBadge status={idx.freshness} />}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-2 px-3 text-center text-xs text-[#687A81] flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#087F73]" />
            <span>Loading verified market index quotes…</span>
          </div>
        )}
      </section>

      {/* ── Market Session & Feed Integrity Status Bar ──────────────────── */}
      <div className="flex flex-wrap items-center justify-between text-xs text-[#687A81] bg-[#FAFBFB] p-3 rounded-[10px] border border-[#E1E7E8] gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              sessionInfo.open ? 'bg-[#087F73]' : 'bg-[#BB4B48]'
            }`}
          />
          <span className="font-semibold text-[#142B32]">
            {sessionInfo.open ? 'NSE Open' : 'Market Closed'}
          </span>
          <span className="text-[#899DA3]">·</span>
          <span>
            {sessionInfo.session === 'REGULAR'
              ? 'Continuous trading window (09:15–15:30 IST)'
              : sessionInfo.reason || 'Outside regular hours'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#899DA3]">
          <span>Feed: {sessionInfo.open ? 'Delayed 15m (yfinance)' : 'EOD Reference'}</span>
          <span>·</span>
          <span>Real-time trades require live broker gateway</span>
        </div>
      </div>

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
              {headline}
            </h2>

            <p className="text-sm text-[#4E685A] leading-relaxed max-w-xl">
              {summary}
            </p>

            {/* Material Changes Across Followed Companies */}
            {personalizedBrief?.watchlist_changes && personalizedBrief.watchlist_changes.length > 0 && (
              <div className="pt-4 border-t border-[#CFDFD3] mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#142B32] uppercase tracking-wider text-[11px]">
                    Material Changes in Your Watchlist
                  </span>
                  <span className="text-[11px] text-[#64806F]">
                    {personalizedBrief.watchlist_changes.length} verified updates
                  </span>
                </div>
                <div className="space-y-1.5">
                  {personalizedBrief.watchlist_changes.slice(0, 3).map((wc: any, idx: number) => (
                    <Link
                      key={idx}
                      href={`/stocks/${wc.symbol}`}
                      className="p-2 bg-white/70 hover:bg-white rounded-[7px] border border-[#CFDFD3] text-xs flex items-center justify-between transition-colors group block"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#142B32] group-hover:text-[#087F73]">{wc.symbol}</span>
                        <span className="text-[#4E685A] text-[11px] truncate max-w-xs">{wc.top_change}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#64806F] group-hover:text-[#087F73] shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Portfolio Exposure & Sector Allocation */}
            {personalizedBrief?.has_portfolio && personalizedBrief.portfolio_exposure && (
              <div className="pt-4 border-t border-[#CFDFD3] mt-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#142B32] uppercase tracking-wider text-[11px]">
                    Your Portfolio Exposure
                  </span>
                  <Link href="/portfolio" className="text-[#087F73] font-semibold hover:underline">
                    Portfolio Desk →
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white/60 p-2.5 rounded-[8px] border border-[#CFDFD3]">
                  <div>
                    <span className="text-[#64806F] text-[10px] block">Invested</span>
                    <strong className="text-xs font-mono text-[#142B32]">
                      {formatINR(personalizedBrief.portfolio_exposure.total_invested, 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#64806F] text-[10px] block">Current Value</span>
                    <strong className="text-xs font-mono text-[#142B32]">
                      {formatINR(personalizedBrief.portfolio_exposure.current_value, 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#64806F] text-[10px] block">Day Return</span>
                    <strong className={`text-xs font-mono font-semibold ${
                      (personalizedBrief.portfolio_exposure.day_pnl ?? 0) >= 0 ? 'text-[#087F73]' : 'text-[#BB4B48]'
                    }`}>
                      {(personalizedBrief.portfolio_exposure.day_pnl ?? 0) >= 0 ? '+' : ''}
                      {formatINR(personalizedBrief.portfolio_exposure.day_pnl, 0)}
                    </strong>
                  </div>
                </div>
                {personalizedBrief.portfolio_exposure.concentrated_sectors?.length > 0 && (
                  <div className="p-2 bg-[#FAF0DC] rounded-[6px] text-[11px] text-[#8F6A24] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Sector Concentration: {personalizedBrief.portfolio_exposure.concentrated_sectors.join(', ')} exceeds 35% of your portfolio equity.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Onboarding Guidance for New Accounts */}
            {personalizedBrief?.is_onboarding && (
              <div className="pt-4 border-t border-[#CFDFD3] mt-4 p-3 bg-white/70 rounded-[8px] border border-[#CFDFD3] space-y-2 text-xs">
                <div className="font-semibold text-[#142B32]">Build your personal research desk</div>
                <p className="text-[#4E685A] text-[11px] leading-relaxed">
                  Follow companies on NSE to track verified indicator shifts, or record your equity holdings to monitor portfolio exposure.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/stocks"
                    className="px-2.5 py-1 bg-[#087F73] text-white rounded-[5px] text-[11px] font-semibold hover:bg-[#076f64] transition-colors"
                  >
                    Explore NSE Equities
                  </Link>
                  <Link
                    href="/portfolio"
                    className="px-2.5 py-1 bg-white text-[#142B32] border border-[#CFDFD3] rounded-[5px] text-[11px] font-semibold hover:bg-[#EEF2F2] transition-colors"
                  >
                    Add Holdings
                  </Link>
                </div>
              </div>
            )}

            {/* Analyst View Extra Breakdown */}
            {mode === 'analyst' && (
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#CFDFD3] mt-5 animate-fade-in">
                <div>
                  <span className="text-xs text-[#64806F] block">Coverage</span>
                  <strong className="text-sm font-semibold text-[#142B32]">
                    {sampleSize > 0 ? `${sampleSize} constituents` : 'Waiting for feed'}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-[#64806F] block">Advances / Declines</span>
                  <strong className="text-sm font-semibold text-[#142B32] font-mono">
                    {advances !== null && declines !== null ? `${advances} / ${declines}` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-[#64806F] block">Breadth Source</span>
                  <strong className="text-sm font-semibold text-[#142B32] capitalize">
                    {breadthSource}
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
              <span>Explore companies</span>
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
                Focus Company
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <StockLogo symbol={focusSymbol} size="md" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#142B32] leading-tight truncate">
                  {focusMeta.name}
                </h3>
                <p className="text-xs text-[#687A81]">{focusSymbol} · NSE · {focusMeta.sector}</p>
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
                {focusPrice !== null ? formatINR(focusPrice, 2) : '—'}
              </strong>
              {focusChange !== null ? (
                <span
                  className={`text-xs font-mono font-medium ${
                    isFocusUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                  }`}
                >
                  {formatPercent(focusChange)} today
                </span>
              ) : (
                <span className="text-xs font-mono text-[#899DA3]">Quote loading</span>
              )}
            </div>

            {/* Trajectory visualization */}
            <div className="h-16 w-full my-3 flex items-center justify-center bg-[#FAFBFB] rounded-[8px] border border-[#E1E7E8] overflow-hidden">
              {focusChart.length >= 2 ? (
                <svg className="w-full h-full p-1" viewBox="0 0 360 60" preserveAspectRatio="none">
                  {(() => {
                    const vals = focusChart.map((c) => c.value);
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const range = max - min || 1;
                    const pts = focusChart
                      .map((c, idx) => {
                        const x = (idx / (focusChart.length - 1)) * 360;
                        const y = 55 - ((c.value - min) / range) * 50;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={isFocusUp ? '#087F73' : '#BB4B48'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })()}
                </svg>
              ) : (
                <span className="text-[11px] text-[#899DA3]">
                  {focusQuote ? '30-day price trend ready' : 'Loading trajectory…'}
                </span>
              )}
            </div>

            {/* Documented Selection Criteria & Evidence */}
            <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] text-xs space-y-1 mb-2">
              <span className="text-[10px] font-semibold text-[#087F73] uppercase tracking-wider block">
                Selection Criteria & Evidence
              </span>
              <p className="text-[#142B32] text-xs leading-relaxed font-medium">
                {focusWhy}
              </p>
              {focusEvidence && (
                <div className="text-[11px] text-[#5C6E74] pt-0.5">
                  Evidence: {focusEvidence}
                </div>
              )}
              {focusRisk && (
                <div className="text-[11px] text-[#BB4B48] pt-0.5">
                  Risk note: {focusRisk}
                </div>
              )}
              <div className="text-[11px] text-[#899DA3] pt-0.5">
                Transparent rule: Ranked across instruments by volume surge, momentum extremes, and moving-average tests. No invented urgency.
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E1E7E8] text-xs text-[#687A81] flex items-center justify-between">
            <span>Stance: {getStance(focusChange).label}</span>
            <Link
              href={`/stocks/${focusSymbol}`}
              className="inline-flex items-center gap-1 text-[#087F73] font-semibold hover:underline"
            >
              <span>Detailed evidence</span>
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
                <p className="text-xs text-[#687A81] mt-0.5">
                  {watchlistSymbols === null
                    ? 'Loading followed companies…'
                    : followedList.length === 0
                    ? 'No companies followed yet'
                    : `Tracking ${followedList.length} companies in your workspace`}
                </p>
              </div>
              <Link
                href="/watchlist"
                className="text-xs font-semibold text-[#087F73] hover:underline"
              >
                Manage list
              </Link>
            </div>

            {watchlistError ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-[#BB4B48] font-medium">
                  {watchlistError}
                </p>
                <button
                  onClick={() => loadData()}
                  className="px-3.5 py-1.5 bg-[#FAF3F0] hover:bg-[#F5E6E1] text-[#BB4B48] border border-[#BB4B48]/30 rounded-[7px] text-xs font-semibold"
                >
                  Retry loading watchlist
                </button>
              </div>
            ) : watchlistSymbols === null ? (
              <div className="p-8 text-center text-xs text-[#687A81]">
                Loading watchlist records…
              </div>
            ) : followedList.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-[#687A81]">
                  Your watchlist is empty. Follow companies from Explore to monitor them here.
                </p>
                <Link
                  href="/stocks"
                  className="inline-block px-3.5 py-1.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold"
                >
                  Explore companies
                </Link>
              </div>
            ) : (
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
                    {displayedWatchlist.map((sym) => {
                      const q = watchlistQuotes[sym];
                      const info = NIFTY50_META[sym] || { name: `${sym} Ltd`, sector: 'Equity' };
                      const price = q?.price;
                      const chg = typeof (q?.change_percent ?? q?.change_pct) === 'number'
                        ? (q.change_percent ?? q.change_pct)
                        : null;
                      const isUp = (chg ?? 0) >= 0;
                      const stance = getStance(chg);

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
                                <div className="text-xs text-[#687A81] truncate max-w-[160px]">
                                  {info.name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-6 text-right font-mono">
                            <div className="font-semibold text-[#142B32]">
                              {typeof price === 'number' ? formatINR(price, 2) : '—'}
                            </div>
                            <div
                              className={`text-xs ${
                                chg !== null
                                  ? isUp
                                    ? 'text-[#087F73]'
                                    : 'text-[#BB4B48]'
                                  : 'text-[#899DA3]'
                              }`}
                            >
                              {chg !== null ? formatPercent(chg) : 'Unavailable'}
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
            )}
          </div>

          <div className="p-4 px-6 border-t border-[#E1E7E8] text-xs text-[#687A81] flex items-center justify-between bg-[#FAFBFA]">
            <span>Deterministic rule observations</span>
            <span>
              {followedList.length > 5
                ? `Showing 5 of ${followedList.length} followed`
                : `${followedList.length} followed`}
            </span>
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
              {attentionItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <article key={item.id} className="py-4 flex gap-3.5">
                    <span className="w-8 h-8 rounded-[8px] bg-[#EFF3F3] text-[#6D8188] flex items-center justify-center shrink-0">
                      <IconComponent className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[#142B32]">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#687A81] mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                      <Link
                        href={item.href}
                        className="inline-block text-xs font-semibold text-[#087F73] hover:underline mt-2"
                      >
                        {item.linkText}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E1E7E8] text-xs text-[#687A81]">
            <span>Based on verified quantitative inputs</span>
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
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-[#4E685A] leading-relaxed">
              <p>
                StockAI follows the approved editorial design reference: deep teal visual grounding, restrained typography, and progressive disclosure.
              </p>
              <div className="bg-[#FAFBFB] p-4 rounded-[10px] border border-[#E1E7E8] space-y-2 text-xs">
                <p className="font-semibold text-[#142B32]">Guiding Principles:</p>
                <p>• Plain-language takeaway first, technical evidence on demand.</p>
                <p>• Zero synthetic values; clear labeling for unavailable states.</p>
                <p>• Deterministic quantitative rules with full rule version transparency.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
