'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, AlertTriangle, RefreshCw, Lightbulb, PieChart as PieIcon, Plus, Trash2, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sparkline } from '@/components/ui/Sparkline';
import { formatNumber } from '@/lib/data';

interface UserHolding {
  symbol: string;
  name: string;
  qty: number;
  avg_price: number;
  current_price: number;
  sector: string;
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<UserHolding[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [symbolInput, setSymbolInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [sectorInput, setSectorInput] = useState('Equity');
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Load holdings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('user_portfolio_holdings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHoldings(parsed);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoaded(true);
  }, []);

  // Sync to localStorage whenever holdings change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('user_portfolio_holdings', JSON.stringify(holdings));
    }
  }, [holdings, isLoaded]);

  // Refresh live prices for existing holdings
  useEffect(() => {
    if (!isLoaded || holdings.length === 0) return;

    import('@/lib/api').then(({ api }) => {
      holdings.forEach((h, idx) => {
        api.getQuoteData(h.symbol)
          .then((data) => {
            if (data && data.price) {
              setHoldings((prev) => {
                const next = [...prev];
                if (next[idx]) {
                  next[idx] = { ...next[idx], current_price: data.price };
                }
                return next;
              });
            }
          })
          .catch(() => {});
      });
    });
  }, [isLoaded]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const sym = symbolInput.trim().toUpperCase();
    const qty = parseFloat(qtyInput);
    const avgPrice = parseFloat(priceInput);

    if (!sym) {
      setAddError('Please enter a valid stock symbol.');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setAddError('Please enter a valid positive quantity.');
      return;
    }
    if (isNaN(avgPrice) || avgPrice <= 0) {
      setAddError('Please enter a valid positive buy price.');
      return;
    }

    setLoadingAdd(true);

    let cmp = avgPrice;
    let name = sym;
    let sec = sectorInput || 'Equity';

    try {
      const { api } = await import('@/lib/api');
      const quote = await api.getQuoteData(sym).catch(() => null);
      if (quote && quote.price) {
        cmp = quote.price;
        name = quote.name || sym;
        sec = quote.sector || sec;
      }
    } catch (err) {
      console.error(err);
    }

    const newHolding: UserHolding = {
      symbol: sym,
      name,
      qty,
      avg_price: avgPrice,
      current_price: cmp,
      sector: sec,
    };

    setHoldings((prev) => [...prev.filter((h) => h.symbol !== sym), newHolding]);
    setSymbolInput('');
    setQtyInput('');
    setPriceInput('');
    setSectorInput('Equity');
    setLoadingAdd(false);
    setShowAddForm(false);
  };

  const handleRemoveHolding = (sym: string) => {
    setHoldings((prev) => prev.filter((h) => h.symbol !== sym));
  };

  // Metrics calculations
  const totalInvested = holdings.reduce((acc, h) => acc + h.qty * h.avg_price, 0);
  const currentValue = holdings.reduce((acc, h) => acc + h.qty * h.current_price, 0);
  const totalPnL = currentValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : '0.00';
  const isPositive = totalPnL >= 0;

  // Sector allocation calculation
  const sectorMap: Record<string, number> = {};
  if (currentValue > 0) {
    holdings.forEach((h) => {
      const val = h.qty * h.current_price;
      const sec = h.sector || 'Other';
      sectorMap[sec] = (sectorMap[sec] || 0) + val;
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Portfolio Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
            Portfolio Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time live holdings tracking, position management, and P&L analysis
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Close Form' : 'Add Holding'}
          </Button>
          <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pb-1">
            <Link
              href="/portfolio"
              className="px-4 py-2 rounded-btn text-xs font-semibold bg-indigo-600 text-white shadow-subtle"
            >
              Holdings Overview
            </Link>
            <Link
              href="/portfolio/risk"
              className="px-4 py-2 rounded-btn text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Risk & Heat
            </Link>
          </div>
        </div>
      </div>

      {/* Add New Holding Form Drawer / Modal */}
      {showAddForm && (
        <Card className="p-6 border-indigo-500/30 bg-indigo-500/5 space-y-4 animate-in fade-in zoom-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
            <div className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Stock to Holdings
              </h3>
            </div>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleAddHolding} className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Stock Ticker Symbol</label>
              <input
                type="text"
                placeholder="e.g. RELIANCE, TCS, INFY, ZOMATO"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Quantity (Shares)</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 50"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-500 font-medium mb-1">Avg Buy Price (₹)</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 1250.00"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={loadingAdd}
                className="w-full justify-center text-xs font-semibold !bg-indigo-600 hover:!bg-indigo-700"
              >
                {loadingAdd ? 'Fetching Price...' : 'Save Holding'}
              </Button>
            </div>
          </form>

          {addError && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">{addError}</p>
          )}
        </Card>
      )}

      {/* Portfolio Top Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total Invested
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              ₹{formatNumber(totalInvested)}
            </span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Current Value
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
              ₹{formatNumber(currentValue)}
            </span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total P&L
          </span>
          <div className="mt-3 flex items-baseline space-x-2">
            <span
              className={`text-h2 font-semibold ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isPositive ? '+' : ''}₹{formatNumber(Math.abs(totalPnL))}
            </span>
            <Badge variant={isPositive ? 'emerald' : 'red'} size="sm">
              {isPositive ? '+' : ''}{totalPnLPct}%
            </Badge>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Return Rate
          </span>
          <div className="mt-3 flex items-baseline space-x-2">
            <span
              className={`text-h2 font-semibold ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isPositive ? '+' : ''}{totalPnLPct}%
            </span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">
            Total Positions
          </span>
          <div className="mt-3">
            <span className="text-h2 font-semibold text-indigo-600 dark:text-indigo-400">
              {holdings.length} Assets
            </span>
          </div>
        </Card>
      </div>

      {/* Main Grid: Holdings Table & Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Detailed Holdings Table */}
        <Card size="large" noPadding className="lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Your Stock Holdings
                </h3>
                <p className="text-caption text-slate-500 dark:text-slate-400">
                  Real-time position performance & cost basis
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setShowAddForm(true)}
              >
                Add Holding
              </Button>
            </div>

            {holdings.length === 0 ? (
              <div className="p-12 text-center space-y-4">
                <PieIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <div>
                  <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    No Holdings Added Yet
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                    Click "Add Holding" above to enter your stock positions, quantity, and buy price to track real-time P&L.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowAddForm(true)}
                  className="mx-auto"
                >
                  Add Your First Holding
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="sys-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Avg Price</th>
                      <th className="text-right">CMP</th>
                      <th className="text-right">Invested</th>
                      <th className="text-right">P&L</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => {
                      const invested = h.qty * h.avg_price;
                      const curVal = h.qty * h.current_price;
                      const pnl = curVal - invested;
                      const pnlPct = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : '0.00';
                      const pos = pnl >= 0;
                      return (
                        <tr key={h.symbol}>
                          <td>
                            <Link href={`/stocks/${h.symbol}`} className="group">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {h.symbol}
                              </div>
                              <div className="text-caption text-slate-500 dark:text-slate-400">
                                {h.name}
                              </div>
                            </Link>
                          </td>
                          <td className="text-right font-medium">{h.qty}</td>
                          <td className="text-right text-slate-600 dark:text-slate-400">
                            ₹{formatNumber(h.avg_price)}
                          </td>
                          <td className="text-right font-semibold">
                            ₹{formatNumber(h.current_price)}
                          </td>
                          <td className="text-right font-medium text-slate-700 dark:text-slate-300">
                            ₹{formatNumber(invested)}
                          </td>
                          <td className="text-right">
                            <div className={`font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {pos ? '+' : ''}₹{formatNumber(Math.abs(pnl))}
                            </div>
                            <div className="text-[10px]">
                              <Badge variant={pos ? 'emerald' : 'red'} size="sm">
                                {pos ? '+' : ''}{pnlPct}%
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right">
                            <button
                              onClick={() => handleRemoveHolding(h.symbol)}
                              className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              title="Delete Holding"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Right Column: Sector Breakdown */}
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <PieIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sector Breakdown
                </h3>
              </div>
              <span className="text-caption text-slate-500">Live Weight</span>
            </div>

            {Object.keys(sectorMap).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Add holdings to view sector allocation.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(sectorMap).map(([sec, val]) => {
                  const pct = currentValue > 0 ? ((val / currentValue) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={sec} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {sec}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
