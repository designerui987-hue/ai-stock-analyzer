'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ArrowUpRight, Bell, Sparkles, Filter } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sparkline } from '@/components/ui/Sparkline';
import { DEMO_STOCKS, formatNumber } from '@/lib/data';

function getSignal(changePct: number) {
  if (changePct > 1.5) return 'buy';
  if (changePct < -0.5) return 'sell';
  return 'hold';
}

export default function WatchlistPage() {
  const [filterQuery, setFilterQuery] = useState('');
  const watchlistStocks = DEMO_STOCKS.slice(0, 10);

  const filtered = watchlistStocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.sector.toLowerCase().includes(filterQuery.toLowerCase())
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
            Active Watchlist
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
          <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />}>
            Add Symbol
          </Button>
        </div>
      </div>

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
        <div className="overflow-x-auto">
          <table className="sys-table">
            <thead>
              <tr>
                <th>Symbol & Sector</th>
                <th className="text-right">Price</th>
                <th className="text-right">Today's Change</th>
                <th className="text-center">Trend (30D)</th>
                <th className="text-right">Volume</th>
                <th className="text-right">Market Cap</th>
                <th className="text-center">AI Signal</th>
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
                            · {stock.sector}
                          </span>
                        </div>
                        <p className="text-caption text-slate-500 dark:text-slate-400 truncate">
                          {stock.name}
                        </p>
                      </Link>
                    </td>

                    <td className="text-right font-semibold text-slate-900 dark:text-slate-100">
                      ₹{formatNumber(stock.price)}
                    </td>

                    <td className="text-right">
                      <Badge variant={isUp ? 'emerald' : 'red'} size="sm">
                        {isUp ? '+' : ''}
                        {stock.change_pct.toFixed(2)}%
                      </Badge>
                    </td>

                    <td className="text-center py-3">
                      <Sparkline
                        data={[stock.price * 0.95, stock.price * 0.97, stock.price]}
                        isPositive={isUp}
                        width={64}
                        height={20}
                      />
                    </td>

                    <td className="text-right text-slate-600 dark:text-slate-400">
                      {(stock.volume / 1000000).toFixed(1)}M
                    </td>

                    <td className="text-right text-slate-600 dark:text-slate-400">
                      {stock.market_cap}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
