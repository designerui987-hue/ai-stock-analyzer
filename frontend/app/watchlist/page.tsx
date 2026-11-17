'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { api } from '@/lib/api';

interface WatchlistStock {
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
  const [watchlistStocks, setWatchlistStocks] = useState<WatchlistStock[]>([]);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      const res = await api.getWatchlist();
      if (!res?.success || !Array.isArray(res.items)) throw new Error('Unable to load watchlist.');
      const stocks = await Promise.all(res.items.map(async (item: { symbol: string; exchange: string }) => {
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
      }));
      setWatchlistStocks(stocks);
      setError(null);
    } catch {
      setError('Unable to load your watchlist. Try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  const symbolsKey = watchlistStocks.filter((stock) => stock.exchange === 'NSE')
    .map((stock) => stock.symbol).sort().join(',');
  // Subscribe to NSE price updates for the current watchlist.
  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split(',');
    const unsub = api.subscribePriceStream(symbols, (payload: Record<string, any>) => {
      if (!payload || typeof payload !== 'object') return;
      setWatchlistStocks((prev) =>
        prev.map((item) => {
          const tick = item.exchange === 'NSE' ? payload[item.symbol] : undefined;
          if (tick && typeof tick.price === 'number' && tick.price > 0) {
            return {
              ...item,
              price: tick.price,
              change_pct: typeof tick.change_percent === 'number' ? tick.change_percent : item.change_pct,
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
      unsub();
    };
  }, [symbolsKey]);

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;

    setIsAdding(true);
    setError(null);
    try {
      await api.addToWatchlist(sym, 'NSE');
      setNewSymbol('');
      setShowAddModal(false);
      await loadWatchlist();
    } catch (err: any) {
      setError(err?.message || 'Failed to add symbol to watchlist.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (sym: string) => {
    setError(null);
    try {
      await api.removeFromWatchlist(sym);
      setWatchlistStocks((prev) => prev.filter((s) => s.symbol !== sym));
    } catch (err: any) {
      setError(err?.message || 'Failed to remove symbol from watchlist.');
    }
  };

  const filtered = watchlistStocks.filter((s) =>
    s.symbol.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
            Your watchlist
          </h2>
          <Badge variant="indigo" size="md">
            {watchlistStocks.length} Tracked Assets
          </Badge>
        </div>

        <div className="flex items-center space-x-3">
          <div className="min-w-0 flex-1 sm:w-64">
            <Input
              icon={<Search className="w-3.5 h-3.5" />}
              placeholder="Filter watchlist..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
          <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            Add Symbol
          </Button>
        </div>
      </div>

      {showAddModal && (
        <form onSubmit={handleAddSymbol} className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Type any NSE stock ticker (e.g. TATAMOTORS, INFY, ITC, SBIN)..."
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
          />
          <Button type="submit" variant="primary" size="md" disabled={!newSymbol.trim() || isAdding}>
            {isAdding ? 'Adding...' : 'Save to Watchlist'}
          </Button>
          <Button type="button" variant="outline" size="md" onClick={() => setShowAddModal(false)}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadWatchlist()}>Reload watchlist</Button>
        </div>
      )}

      {/* Main Watchlist Table */}
      <Card size="large" noPadding className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading watchlist…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-slate-500">
              {watchlistStocks.length > 0 ? 'No symbols match your filter.' : 'Your watchlist is empty.'}
            </p>
            {watchlistStocks.length === 0 && !error && (
              <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
                Add your first NSE symbol
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sys-table">
              <thead>
                <tr>
                  <th>Symbol &amp; Exchange</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Today&apos;s Change</th>
                  <th className="text-center">Data Freshness</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock) => {
                  const change = stock.change_pct;
                  return (
                    <tr key={stock.symbol}>
                      <td>
                        <Link href={`/stocks/${stock.symbol}`} className="group">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {stock.symbol}
                            </span>
                            <span className="text-caption text-slate-400 font-normal">
                              · {stock.exchange}
                            </span>
                          </div>
                        </Link>
                      </td>

                      <td className="text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {stock.price !== null ? `₹${stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unavailable'}
                      </td>

                      <td className="text-right">
                        {change === null ? '—' : (
                          <Badge variant={change > 0 ? 'emerald' : change < 0 ? 'red' : 'slate'} size="sm">
                            {change > 0 ? '+' : ''}{change.toFixed(2)}%
                          </Badge>
                        )}
                      </td>

                      <td className="text-center">
                        <FreshnessBadge
                          status={stock.freshness || 'UNAVAILABLE'}
                          asOf={stock.as_of}
                          source={stock.source ?? null}
                        />
                      </td>

                      <td className="text-right space-x-2">
                        <Link href={`/stocks/${stock.symbol}`}>
                          <Button variant="ghost" size="sm">
                            Analyze
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${stock.symbol} from watchlist`}
                          onClick={() => handleRemove(stock.symbol)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
