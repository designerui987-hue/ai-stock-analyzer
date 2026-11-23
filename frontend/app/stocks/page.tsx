'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Grid,
  BarChart2,
  Activity,
  ArrowRight,
  Bookmark,
  Check,
  Plus,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { formatINR, formatPercent } from '@/lib/format';
import { api } from '@/lib/api';

interface StockDirectoryItem {
  symbol: string;
  name: string;
  sector: string;
}

const STOCK_DIRECTORY: StockDirectoryItem[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Technology' },
  { symbol: 'INFY', name: 'Infosys', sector: 'Technology' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financials' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials' },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'Consumer' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Automotive' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Capital Goods' },
];

const SECTORS = ['All sectors', ...Array.from(new Set(STOCK_DIRECTORY.map((s) => s.sector))).sort()];

export default function ExplorePage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-[#687A81]">Loading market exploration...</div>}>
      <ExploreContent />
    </React.Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const initialSector = searchParams?.get('sector') || 'All sectors';

  const [selectedSector, setSelectedSector] = useState<string>(initialSector);
  const [query, setQuery] = useState<string>('');
  const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({});
  const [quotesLoading, setQuotesLoading] = useState<boolean>(true);
  const [watchlisted, setWatchlisted] = useState<Set<string>>(new Set());
  const [followPending, setFollowPending] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await api.getWatchlist().catch(() => null);
      if (res && Array.isArray(res.items)) {
        setWatchlisted(new Set(res.items.map((i: any) => i.symbol)));
      }
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const quotes: Record<string, any> = {};
      await Promise.all(
        STOCK_DIRECTORY.map(async (s) => {
          const q = await api.getQuoteData(s.symbol, 'NSE').catch(() => null);
          if (q) {
            quotes[s.symbol] = q;
          }
        })
      );
      setLiveQuotes(quotes);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    fetchWatchlist();

    const handleWatchlistChange = () => fetchWatchlist();
    window.addEventListener('watchlist-updated', handleWatchlistChange);
    return () => window.removeEventListener('watchlist-updated', handleWatchlistChange);
  }, [fetchQuotes, fetchWatchlist]);

  const handleToggleFollow = async (symbol: string) => {
    setFollowPending(symbol);
    const isCurrentlyFollowing = watchlisted.has(symbol);
    const nextSet = new Set(watchlisted);

    if (isCurrentlyFollowing) {
      nextSet.delete(symbol);
    } else {
      nextSet.add(symbol);
    }
    setWatchlisted(nextSet);

    try {
      if (isCurrentlyFollowing) {
        await api.removeFromWatchlist(symbol);
      } else {
        await api.addToWatchlist(symbol, 'NSE');
      }
      window.dispatchEvent(new CustomEvent('watchlist-updated'));
    } catch {
      // Rollback on failure
      const rollbackSet = new Set(watchlisted);
      setWatchlisted(rollbackSet);
    } finally {
      setFollowPending(null);
    }
  };

  const filtered = STOCK_DIRECTORY.filter((s) => {
    const matchesSector = selectedSector === 'All sectors' || s.sector === selectedSector;
    const matchesQuery =
      !query.trim() ||
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase());
    return matchesSector && matchesQuery;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">WHICH COMPANY SHOULD I INVESTIGATE?</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Explore the market.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            Verified Indian equity universe · Real observations only, zero synthetic fixtures.
          </p>
        </div>

        {/* Compact Tools Toolbar */}
        <div className="flex items-center gap-2">
          <Link
            href="/heatmap"
            className="px-3 py-1.5 bg-white hover:bg-[#EEF2F2] border border-[#E1E7E8] rounded-[7px] text-xs font-semibold text-[#142B32] flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Grid className="w-3.5 h-3.5 text-[#087F73]" />
            <span>Heatmap</span>
          </Link>
          <Link
            href="/backtest"
            className="px-3 py-1.5 bg-white hover:bg-[#EEF2F2] border border-[#E1E7E8] rounded-[7px] text-xs font-semibold text-[#142B32] flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#087F73]" />
            <span>Backtesting</span>
          </Link>
          <Link
            href="/performance"
            className="px-3 py-1.5 bg-white hover:bg-[#EEF2F2] border border-[#E1E7E8] rounded-[7px] text-xs font-semibold text-[#142B32] flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-[#087F73]" />
            <span>Signal Ledger</span>
          </Link>
        </div>
      </div>

      {/* ── Filter Bar & Search ────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter sectors"
      >
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSector(s)}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all ${
              selectedSector === s
                ? 'bg-[#142B32] text-white border-[#142B32]'
                : 'bg-white text-[#60737A] border-[#E1E7E8] hover:text-[#142B32]'
            }`}
            aria-pressed={selectedSector === s}
          >
            {s}
          </button>
        ))}

        <div className="ml-auto w-full sm:w-64 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#687A81]" />
          <input
            type="text"
            placeholder="Filter by company or ticker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E1E7E8] rounded-[7px] text-xs text-[#142B32] placeholder:text-[#687A81] focus:outline-none focus:ring-2 focus:ring-[#087F73]/30"
          />
        </div>
      </div>

      {/* ── Main Explore Table ──────────────────────────────────────────── */}
      <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden">
        <div className="p-5 md:p-6 pb-4 flex items-center justify-between border-b border-[#E1E7E8]">
          <div>
            <h2 className="text-[20px] font-semibold text-[#142B32]">
              {selectedSector === 'All sectors' ? 'Companies in focus' : selectedSector}
            </h2>
            <div className="text-xs text-[#687A81] mt-0.5">
              {filtered.length} companies · National Stock Exchange (NSE)
            </div>
          </div>
          {quotesLoading && (
            <span className="text-xs text-[#687A81] flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#087F73]" />
              Updating quotes…
            </span>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                  <th className="py-2.5 px-6 font-medium">Company</th>
                  <th className="py-2.5 px-6 text-right font-medium">Price</th>
                  <th className="py-2.5 px-6 text-right font-medium">Daily Change</th>
                  <th className="py-2.5 px-6 font-medium">Research Observation</th>
                  <th className="py-2.5 px-6 text-right font-medium">Follow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF0F0]">
                {filtered.map((x) => {
                  const lq = liveQuotes[x.symbol];
                  const hasRealPrice = lq && typeof lq.price === 'number' && lq.price > 0 && lq.status !== 'unavailable';
                  const hasRealChange = lq && typeof lq.change_percent === 'number' && lq.change_percent !== null && !isNaN(lq.change_percent) && lq.status !== 'unavailable';
                  const isUp = hasRealChange ? lq.change_percent > 0 : false;
                  const isZero = hasRealChange && lq.change_percent === 0;
                  const isFollowing = watchlisted.has(x.symbol);
                  const isPending = followPending === x.symbol;
                  const isStale = lq?.freshness === 'STALE';

                  // Derive factual research observation from verified quote data
                  let observationText = 'Observation unavailable';
                  let observationClass = 'text-[#687A81] bg-[#EEF2F2]';

                  if (isStale) {
                    const dateStr = lq.as_of ? new Date(lq.as_of).toISOString().slice(0, 10) : 'Stale';
                    const src = lq.source || 'Cache';
                    if (hasRealChange) {
                      const moveStr = lq.change_percent > 0 ? `+${lq.change_percent.toFixed(2)}%` : isZero ? '0.00%' : `${lq.change_percent.toFixed(2)}%`;
                      observationText = `Stale move (${moveStr}) · ${dateStr} · ${src}`;
                    } else {
                      observationText = `Cached observation [${dateStr} · ${src}]`;
                    }
                    observationClass = 'text-[#8B734D] bg-[#FAF3E5] border-[#EEE2C6]';
                  } else if (hasRealPrice && hasRealChange) {
                    if (lq.change_percent >= 1.5) {
                      observationText = `Strong 1D advance (+${lq.change_percent.toFixed(2)}%) · Verified`;
                      observationClass = 'text-[#087F73] bg-[#EAF2EC] border-[#D8E5DE]';
                    } else if (lq.change_percent <= -1.5) {
                      observationText = `1D decline (${lq.change_percent.toFixed(2)}%) · Verified`;
                      observationClass = 'text-[#BB4B48] bg-[#FAF3F0] border-[#F2D6D3]';
                    } else if (isZero) {
                      observationText = 'Unchanged session · Verified';
                      observationClass = 'text-[#687A81] bg-[#EEF2F2] border-[#E1E7E8]';
                    } else {
                      observationText = `${lq.change_percent > 0 ? '+' : ''}${lq.change_percent.toFixed(2)}% 1D move · Verified`;
                      observationClass = lq.change_percent > 0
                        ? 'text-[#087F73] bg-[#EAF2EC] border-[#D8E5DE]'
                        : 'text-[#BB4B48] bg-[#FAF3F0] border-[#F2D6D3]';
                    }
                  }

                  return (
                    <tr key={x.symbol} className="hover:bg-[#F9FBFA] transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <StockLogo symbol={x.symbol} size="sm" />
                          <div>
                            <Link
                              href={`/stocks/${x.symbol}`}
                              className="font-semibold text-[#142B32] hover:text-[#087F73] transition-colors"
                            >
                              {x.symbol}
                            </Link>
                            <div className="text-xs text-[#687A81]">{x.name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-6 text-right font-mono">
                        {hasRealPrice ? (
                          <div>
                            <div className="font-semibold text-[#142B32]">
                              {formatINR(lq.price, 2)}
                            </div>
                            {isStale && (
                              <div className="text-[10px] text-[#8B734D] font-sans mt-0.5">
                                STALE · {lq.source || 'Cache'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-[#687A81]">
                            Unavailable
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-right font-mono">
                        {hasRealChange ? (
                          <div>
                            <div
                              className={`text-xs font-semibold ${
                                isUp ? 'text-[#087F73]' : isZero ? 'text-[#687A81]' : 'text-[#BB4B48]'
                              }`}
                            >
                              {formatPercent(lq.change_percent)}
                            </div>
                            {isStale && (
                              <div className="text-[10px] text-[#8B734D] font-sans mt-0.5" title={`Observed ${lq.as_of || 'unknown'} via ${lq.source || 'Cache'}`}>
                                {lq.as_of ? new Date(lq.as_of).toISOString().slice(0, 10) : 'Stale'} · {lq.source || 'Cache'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-[#899DA3]">
                            Unavailable
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-6">
                        <span
                          className={`inline-block px-2.5 py-1 text-[11px] font-medium rounded-[5px] border ${observationClass}`}
                        >
                          {observationText}
                        </span>
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleFollow(x.symbol)}
                          disabled={isPending}
                          aria-label={`${isFollowing ? 'Unfollow' : 'Follow'} ${x.symbol}`}
                          className={`px-3 py-1 text-xs font-semibold rounded-[6px] border transition-all ${
                            isFollowing
                              ? 'bg-[#EAF2EC] text-[#087F73] border-[#D8E5DE] hover:bg-[#FAF3F0] hover:text-[#BB4B48] hover:border-[#F2D6D3]'
                              : 'bg-white text-[#142B32] border-[#E1E7E8] hover:border-[#087F73] hover:text-[#087F73]'
                          } disabled:opacity-50`}
                        >
                          {isPending ? '…' : isFollowing ? '✓ Following' : '+ Follow'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-[#687A81] space-y-2">
            <p className="font-medium text-sm text-[#142B32]">No matching companies found</p>
            <p>Try searching for another symbol or selecting a different sector.</p>
          </div>
        )}

        <div className="p-4 px-6 border-t border-[#E1E7E8] text-xs text-[#687A81] bg-[#FAFBFA] flex items-center justify-between">
          <span>Objective indicator signals evaluated with documented mathematical formulas</span>
          <span>{filtered.length} instruments</span>
        </div>
      </section>
    </div>
  );
}
