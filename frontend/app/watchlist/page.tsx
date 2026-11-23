'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  X,
  Trash2,
  Bell,
  AlertCircle,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { formatINR, formatPercent } from '@/lib/format';
import { api, auth } from '@/lib/api';

interface WatchlistItem {
  symbol: string;
  exchange: string;
  price: number | null;
  change_pct: number | null;
  freshness?: string;
  source?: string;
  as_of?: string;
}

export default function WatchlistPage() {
  const [filterQuery, setFilterQuery] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [watchlistStocks, setWatchlistStocks] = useState<WatchlistItem[]>([]);
  const [lastAsOf, setLastAsOf] = useState<string | null>(null);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getWatchlist();
      if (!res?.success || !Array.isArray(res.items)) {
        throw new Error('Unable to retrieve watchlist records from server.');
      }

      const stocks = await Promise.all(
        res.items.map(async (item: { symbol: string; exchange: string }) => {
          const q = await api.getQuoteData(item.symbol, item.exchange).catch(() => null);
          return {
            symbol: item.symbol,
            exchange: item.exchange,
            price: typeof q?.price === 'number' && q.price > 0 ? q.price : null,
            change_pct: typeof q?.change_percent === 'number' ? q.change_percent : null,
            freshness: q?.freshness || 'UNAVAILABLE',
            source: q?.source,
            as_of: q?.as_of,
          };
        })
      );

      setWatchlistStocks(stocks);
      setLastAsOf(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST');
    } catch (err: any) {
      setError(err?.message || 'Unable to load your watchlist. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  // SSE real-time stream subscription for watchlist
  const symbolsKey = watchlistStocks
    .filter((s) => s.exchange === 'NSE')
    .map((s) => s.symbol)
    .sort()
    .join(',');

  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split(',');
    const unsub = api.subscribePriceStream(symbols, (payload: Record<string, any>) => {
      if (!payload || typeof payload !== 'object') return;
      setWatchlistStocks((prev) =>
        prev.map((item) => {
          const tick = payload[item.symbol];
          if (tick && typeof tick.price === 'number' && tick.price > 0) {
            return {
              ...item,
              price: tick.price,
              change_pct:
                typeof tick.change_percent === 'number'
                  ? tick.change_percent
                  : item.change_pct,
              freshness: tick.freshness || item.freshness,
              source: tick.source || item.source,
              as_of: tick.as_of || item.as_of,
            };
          }
          return item;
        })
      );
    });

    return () => {
      if (unsub) unsub();
    };
  }, [symbolsKey]);

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) {
      setModalError('Please enter a valid stock symbol.');
      return;
    }

    if (!/^[A-Z0-9.\-&]{1,20}$/.test(sym)) {
      setModalError('Invalid symbol: must be 1-20 alphanumeric characters, dots, or hyphens.');
      return;
    }

    setIsAdding(true);
    setModalError(null);
    try {
      await api.addToWatchlist(sym, 'NSE');
      setNewSymbol('');
      setShowAddModal(false);
      await loadWatchlist();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watchlist-updated'));
      }
    } catch (err: any) {
      setModalError(err?.message || 'Failed to add symbol to watchlist.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (sym: string) => {
    try {
      await api.removeFromWatchlist(sym);
      setWatchlistStocks((prev) => prev.filter((s) => s.symbol !== sym));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watchlist-updated'));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to remove symbol from watchlist.');
    }
  };

  const getStance = (sym: string, chg: number | null) => {
    if (chg === null) return { label: 'Observation unavailable', tone: 'caution' };
    if (chg > 1.5) return { label: 'Strong momentum', tone: '' };
    if (chg > 0) return { label: 'Steady trend', tone: '' };
    if (chg > -1.5) return { label: 'Consolidating', tone: 'caution' };
    return { label: 'Under pressure', tone: 'caution' };
  };

  const filtered = watchlistStocks.filter((s) =>
    s.symbol.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Intro ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">KEEP YOUR RESEARCH CLOSE</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Your watchlist.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            {loading && watchlistStocks.length === 0
              ? 'Loading followed companies…'
              : error
              ? 'Watchlist status unavailable'
              : watchlistStocks.length === 0
              ? 'No companies followed yet. Start by adding companies below.'
              : `${watchlistStocks.length} companies followed. A clearer reason to pay attention.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#687A81]" />
            <input
              type="text"
              placeholder="Filter watchlist"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-[#E1E7E8] rounded-[7px] text-xs text-[#142B32] placeholder:text-[#687A81] focus:outline-none focus:ring-2 focus:ring-[#087F73]/30 w-44 sm:w-56"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add a company</span>
          </button>
        </div>
      </div>

      {/* ── Add Stock Form Modal ────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0c232c]/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] max-w-sm w-full p-6 shadow-2xl border border-[#E1E7E8] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E7E8] pb-3">
              <h3 className="text-base font-semibold text-[#142B32]">Add to Watchlist</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setModalError(null);
                }}
                className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSymbol} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#142B32] block mb-1">
                  NSE Symbol
                </label>
                <input
                  type="text"
                  placeholder="e.g. RELIANCE, TCS, INFY"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  required
                  className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs uppercase bg-white text-[#142B32] focus:outline-none focus:ring-2 focus:ring-[#087F73]/30"
                />
              </div>

              {modalError && (
                <p className="text-xs text-[#BB4B48]">{modalError}</p>
              )}

              <button
                type="submit"
                disabled={isAdding}
                className="w-full py-2 bg-[#087F73] hover:bg-[#076f64] text-white rounded-[7px] text-xs font-semibold disabled:opacity-50"
              >
                {isAdding ? 'Adding...' : 'Follow Symbol'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Error Banner (When failed, retains data & retry) ────────────── */}
      {error && (
        <div className="p-4 bg-[#FAF3E5] border border-[#EEE2C6] text-[#8B734D] rounded-[10px] text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadWatchlist}
            className="font-semibold text-[#142B32] hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* ── Main Watchlist Content ──────────────────────────────────────── */}
      {loading && watchlistStocks.length === 0 ? (
        <div className="bg-white border border-[#E1E7E8] rounded-[14px] p-8 text-center text-xs text-[#687A81]">
          Loading watchlist records and quotes...
        </div>
      ) : error && watchlistStocks.length === 0 ? (
        /* Service failure when no previous cache exists */
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-[#FAF3E5] text-[#8B734D] border border-[#EEE2C6] mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[20px] font-semibold text-[#142B32]">Watchlist service temporarily unavailable</h2>
            <p className="text-xs text-[#687A81] max-w-sm mx-auto mt-2 leading-relaxed">
              {error}
            </p>
          </div>
          <button
            onClick={loadWatchlist}
            className="px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry connection</span>
          </button>
        </section>
      ) : !loading && !error && watchlistStocks.length === 0 ? (
        /* Empty State */
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-[#F0F5F3] text-[#087F73] border border-[#E1E7E8] mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold text-[#142B32]">
              Start with companies you know.
            </h2>
            <p className="text-xs text-[#687A81] max-w-sm mx-auto mt-2 leading-relaxed">
              Add a few companies you follow. Your daily brief will keep their moves and research within reach.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add your first company</span>
          </button>
        </section>
      ) : (
        /* Table of followed companies */
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                  <th className="py-2.5 px-6 font-medium">Company</th>
                  <th className="py-2.5 px-6 text-right font-medium">Price / Today</th>
                  <th className="py-2.5 px-6 font-medium hidden sm:table-cell">Research view</th>
                  <th className="py-2.5 px-6 text-right font-medium">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF0F0]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[#687A81]">
                      No companies found matching &ldquo;{filterQuery}&rdquo;.
                      <button
                        onClick={() => setFilterQuery('')}
                        className="ml-2 text-[#087F73] font-semibold hover:underline"
                      >
                        Clear filter
                      </button>
                    </td>
                  </tr>
                ) : (
                  filtered.map((x) => {
                    const chg = x.change_pct ?? 0;
                    const isUp = chg >= 0;
                    const stance = getStance(x.symbol, x.change_pct);

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
                              <div className="text-xs text-[#687A81]">{x.exchange}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono">
                          <div className="font-semibold text-[#142B32]">
                            {typeof x.price === 'number' ? formatINR(x.price, 2) : '—'}
                          </div>
                          <div
                            className={`text-xs ${
                              isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                            }`}
                          >
                            {typeof x.price === 'number' ? formatPercent(chg) : 'Unavailable'}
                          </div>
                        </td>
                        <td className="py-3.5 px-6 hidden sm:table-cell">
                          <span className={`stance ${stance.tone}`}>{stance.label}</span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() => handleRemove(x.symbol)}
                            className="p-1.5 text-[#687A81] hover:text-[#BB4B48] rounded hover:bg-[#EEF2F2] transition-colors"
                            aria-label={`Remove ${x.symbol} from watchlist`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 px-6 border-t border-[#E1E7E8] text-xs text-[#687A81] bg-[#FAFBFA] flex items-center justify-between">
            <span>
              {lastAsOf ? `Last synchronized at ${lastAsOf}` : 'Quotes as of latest market feed'}
            </span>
            <span>{watchlistStocks.length} followed</span>
          </div>
        </section>
      )}

      {/* ── Price Alerts Section ───────────────────────────────────────── */}
      <section
        id="alerts"
        className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E3F2ED] text-[#087F73] flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#142B32]">
              Let a price level bring you back.
            </h3>
            <p className="text-xs text-[#687A81] mt-0.5">
              Open a company in research or explore to save target alerts directly to your account.
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="text-xs font-semibold text-[#087F73] hover:underline whitespace-nowrap"
        >
          Manage alert delivery channels →
        </Link>
      </section>
    </div>
  );
}
