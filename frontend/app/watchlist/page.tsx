'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Trash2, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { api, auth } from '@/lib/api';

function getSignal(changePct: number) {
  if (changePct > 1.5) return 'buy';
  if (changePct < -0.5) return 'sell';
  return 'hold';
}

interface WatchlistStock {
  symbol: string;
  exchange: string;
  price: number;
  change_pct: number;
  volume: number;
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
  const [watchlistStocks, setWatchlistStocks] = useState<WatchlistStock[]>([]);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      const res = await api.getWatchlist();
      if (res?.success && Array.isArray(res.items)) {
        if (res.items.length === 0) {
          setWatchlistStocks([]);
          return;
        }

        // Fetch quote data for each tracked symbol
        const stockPromises = res.items.map(async (item: any) => {
          try {
            const q = await api.getQuoteData(item.symbol);
            return {
              symbol: item.symbol,
              exchange: item.exchange || 'NSE',
              price: typeof q?.price === 'number' ? q.price : 0,
              change_pct: typeof q?.change_percent === 'number' ? q.change_percent : 0,
              volume: typeof q?.volume === 'number' ? q.volume : 0,
              freshness: q?.freshness || 'DELAYED',
              source: q?.source || 'yfinance',
              as_of: q?.as_of || item.added_at,
            };
          } catch {
            return {
              symbol: item.symbol,
              exchange: item.exchange || 'NSE',
              price: 0,
              change_pct: 0,
              volume: 0,
              freshness: 'UNAVAILABLE',
              source: 'yfinance',
              as_of: item.added_at,
            };
          }
        });

        const resolved = await Promise.all(stockPromises);
        setWatchlistStocks(resolved);
      }
    } catch (e) {
      console.error('Error fetching watchlist:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  // Subscribe to price stream for active watchlist
  useEffect(() => {
    if (watchlistStocks.length === 0) return;
    const symbols = watchlistStocks.map((s) => s.symbol);
    const unsub = api.subscribePriceStream(symbols, (payload: Record<string, any>) => {
      if (!payload || typeof payload !== 'object') return;
      setWatchlistStocks((prev) =>
        prev.map((item) => {
          const tick = payload[item.symbol];
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
  }, [watchlistStocks.length]);

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;

    setIsAdding(true);
    try {
      await api.addToWatchlist(sym, 'NSE');
      setNewSymbol('');
      setShowAddModal(false);
      await loadWatchlist();
    } catch (err: any) {
      alert(err?.message || 'Failed to add symbol to watchlist');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (sym: string) => {
    try {
      await api.removeFromWatchlist(sym);
      setWatchlistStocks((prev) => prev.filter((s) => s.symbol !== sym));
    } catch (err: any) {
      alert(err?.message || 'Failed to remove symbol from watchlist');
    }
  };

  const filtered = watchlistStocks.filter((s) =>
    s.symbol.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const buyCount = watchlistStocks.filter((s) => s.change_pct > 1.5).length;
  const holdCount = watchlistStocks.filter((s) => s.change_pct >= -0.5 && s.change_pct <= 1.5).length;
  const sellCount = watchlistStocks.filter((s) => s.change_pct < -0.5).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
            Personal Watchlist &amp; Market Radar
          </h2>
          <Badge variant="indigo" size="md">
            {watchlistStocks.length} Tracked Assets
          </Badge>
        </div>

        <div className="flex items-center space-x-3">
          <div className="w-64">
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
        <form onSubmit={handleAddSymbol} className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-500/30 rounded-xl flex items-center space-x-3">
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

      {/* Signal Distribution Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium">Buy Signals</span>
            <p className="text-h2 font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
              {buyCount} Assets
            </p>
          </div>
          <Badge variant="emerald" size="md">
            Bullish Setup
          </Badge>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium">Hold Signals</span>
            <p className="text-h2 font-semibold text-amber-600 dark:text-amber-400 mt-1">
              {holdCount} Assets
            </p>
          </div>
          <Badge variant="amber" size="md">
            Consolidating
          </Badge>
        </Card>

        <Card className="flex items-center justify-between">
          <div>
            <span className="text-caption text-slate-500 font-medium">Sell Alerts</span>
            <p className="text-h2 font-semibold text-red-600 dark:text-red-400 mt-1">
              {sellCount} Assets
            </p>
          </div>
          <Badge variant="red" size="md">
            Risk Warning
          </Badge>
        </Card>
      </div>

      {/* Main Watchlist Table */}
      <Card size="large" noPadding className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Loading your personal watchlist from database...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-slate-500">
              Your personal watchlist is empty.
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
              Add your first NSE symbol
            </Button>
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
                  <th className="text-center">Quant Signal</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock) => {
                  const isUp = stock.change_pct >= 0;
                  const sig = getSignal(stock.change_pct);
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
                        {stock.price > 0 ? `₹${stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unavailable'}
                      </td>

                      <td className="text-right">
                        <Badge variant={isUp ? 'emerald' : 'red'} size="sm">
                          {isUp ? '+' : ''}
                          {stock.change_pct.toFixed(2)}%
                        </Badge>
                      </td>

                      <td className="text-center">
                        <FreshnessBadge
                          status={stock.freshness || 'DELAYED'}
                          asOf={stock.as_of}
                          source={stock.source}
                        />
                      </td>

                      <td className="text-center">
                        <Badge variant={sig as any} size="sm">
                          {sig.toUpperCase()}
                        </Badge>
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
