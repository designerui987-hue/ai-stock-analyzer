'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Lightbulb,
  PieChart as PieIcon,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Wallet,
  Briefcase,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/data';
import { api } from '@/lib/api';
import { useAuth } from '@/store/useAuth';

interface BackendHolding {
  symbol: string;
  name?: string;
  qty: number;
  avg_price: number;
  current_price: number | null;
  invested?: number;
  current_value?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  day_change?: number | null;
  sector?: string;
  as_of?: string | null;
  source?: string;
  freshness?: string;
}

interface PortfolioSummary {
  status: string;
  total_invested: number;
  current_value: number | null;
  total_pnl: number | null;
  total_pnl_pct: number | null;
  day_pnl: number | null;
  day_pnl_pct: number | null;
  holdings_count: number;
  holdings: BackendHolding[];
  sector_allocation?: Record<string, number>;
}

interface PaperPosition {
  symbol: string;
  quantity: number;
  avg_price: number;
  current_price: number | null;
  invested: number;
  current_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
}

export default function PortfolioPage() {
  const accountId = useAuth((state) => state.user?.id);
  if (!accountId) return <p role="status" className="p-8 text-center text-slate-500">Loading your portfolio…</p>;
  return <AccountPortfolio key={accountId} accountId={accountId} storageKey={`portfolio-holdings:${accountId}`} />;
}

function AccountPortfolio({ accountId, storageKey }: { accountId: string; storageKey: string }) {
  const [activeAccountTab, setActiveAccountTab] = useState<'MANUAL' | 'PAPER' | 'BROKER'>('MANUAL');
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [paperOrders, setPaperOrders] = useState<any[]>([]);
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [symbolInput, setSymbolInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchPortfolioData = useCallback(async () => {
    try {
      setLoading(true);
      const [portRes, paperRes] = await Promise.all([
        api.getPortfolio().catch(() => null),
        fetch('/api/broker/orders?mode=PAPER')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (portRes && Array.isArray(portRes.holdings)) {
        // Automatic legacy migration: if backend is empty and localStorage has legacy positions, migrate them
        if (portRes.holdings.length === 0 && typeof window !== 'undefined') {
          const savedLegacy = localStorage.getItem(storageKey);
          if (savedLegacy) {
            try {
              const legacyList = JSON.parse(savedLegacy);
              if (Array.isArray(legacyList) && legacyList.length > 0) {
                for (const item of legacyList) {
                  if (item.symbol && item.qty > 0 && item.avg_price > 0) {
                    await api.addHolding(item.symbol, Number(item.qty), Number(item.avg_price)).catch(() => null);
                  }
                }
                localStorage.removeItem(storageKey);
                const migratedPort = await api.getPortfolio().catch(() => null);
                if (migratedPort) {
                  setPortfolio(migratedPort);
                  return;
                }
              }
            } catch (err) {
              console.warn('Failed to migrate legacy localStorage holdings:', err);
            }
          }
        }
        setPortfolio(portRes);
      }

      if (paperRes && Array.isArray(paperRes.paper_orders || paperRes.orders)) {
        const orders = paperRes.paper_orders || paperRes.orders;
        setPaperOrders(orders);

        // Derive paper positions from filled paper orders
        const posMap: Record<string, { qty: number; totalCost: number }> = {};
        const filled = orders.filter((o: any) => o.status === 'FILLED');
        for (const ord of filled) {
          const sym = ord.symbol.toUpperCase();
          const q = Number(ord.quantity);
          const p = Number(ord.price || 0);
          if (!posMap[sym]) posMap[sym] = { qty: 0, totalCost: 0 };
          if (ord.transaction_type === 'BUY') {
            posMap[sym].qty += q;
            posMap[sym].totalCost += q * p;
          } else if (ord.transaction_type === 'SELL') {
            const currentAvg = posMap[sym].qty > 0 ? posMap[sym].totalCost / posMap[sym].qty : 0;
            posMap[sym].qty -= q;
            posMap[sym].totalCost = Math.max(0, posMap[sym].totalCost - q * currentAvg);
          }
        }

        const derivedPositions: PaperPosition[] = [];
        for (const [sym, data] of Object.entries(posMap)) {
          if (data.qty > 0) {
            const avg = data.qty > 0 ? data.totalCost / data.qty : 0;
            derivedPositions.push({
              symbol: sym,
              quantity: data.qty,
              avg_price: avg,
              current_price: null,
              invested: data.totalCost,
              current_value: null,
              pnl: null,
              pnl_pct: null,
            });
          }
        }
        setPaperPositions(derivedPositions);

        // Fetch quotes for derived paper positions
        for (const pos of derivedPositions) {
          void api.getQuoteData(pos.symbol).then((q) => {
            if (typeof q?.price === 'number' && q.price > 0) {
              setPaperPositions((prev) =>
                prev.map((entry) => {
                  if (entry.symbol !== pos.symbol) return entry;
                  const cur = entry.quantity * q.price;
                  const pnl = cur - entry.invested;
                  const pnlPct = entry.invested > 0 ? (pnl / entry.invested) * 100 : 0;
                  return {
                    ...entry,
                    current_price: q.price,
                    current_value: cur,
                    pnl,
                    pnl_pct: pnlPct,
                  };
                })
              );
            }
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Portfolio fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const sym = symbolInput.trim().toUpperCase();
    const qty = parseInt(qtyInput, 10);
    const avgPrice = parseFloat(priceInput);

    if (!sym) {
      setAddError('Please enter a valid stock symbol.');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setAddError('Please enter a valid positive integer quantity.');
      return;
    }
    if (isNaN(avgPrice) || avgPrice <= 0) {
      setAddError('Please enter a valid positive average buy price.');
      return;
    }

    setLoadingAdd(true);
    try {
      await api.addHolding(sym, qty, avgPrice);
      setSymbolInput('');
      setQtyInput('');
      setPriceInput('');
      setShowAddForm(false);
      await fetchPortfolioData();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to save holding to server.');
    } finally {
      setLoadingAdd(false);
    }
  };

  const handleRemoveHolding = async (sym: string) => {
    try {
      await api.removeHolding(sym);
      await fetchPortfolioData();
    } catch (err) {
      console.error('Failed to remove holding:', err);
    }
  };

  const manualHoldings = portfolio?.holdings || [];
  const manualInvested = portfolio?.total_invested ?? manualHoldings.reduce((sum, h) => sum + h.qty * h.avg_price, 0);
  const manualCurrentVal = portfolio?.current_value;
  const manualPnL = portfolio?.total_pnl;
  const manualPnLPct = portfolio?.total_pnl_pct;
  const hasCompleteQuotes = portfolio?.status === 'available' || (manualHoldings.length > 0 && manualHoldings.every((h) => h.current_price !== null));
  const isPositive = (manualPnL ?? 0) >= 0;

  const sectorMap = portfolio?.sector_allocation || {};

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Portfolio Header & Account Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
            Portfolio &amp; Asset Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Authoritative positions persisted per-account in PostgreSQL with live market valuation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {activeAccountTab === 'MANUAL' && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? 'Close Form' : 'Add Holding'}
            </Button>
          )}
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
              Risk &amp; Heat
            </Link>
          </div>
        </div>
      </div>

      {/* Account Type Selector Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/[0.08] gap-6">
        <button
          onClick={() => setActiveAccountTab('MANUAL')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
            activeAccountTab === 'MANUAL'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Manual Holdings (DB Backed)</span>
          <Badge variant="neutral" size="sm">
            {manualHoldings.length}
          </Badge>
        </button>

        <button
          onClick={() => setActiveAccountTab('PAPER')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
            activeAccountTab === 'PAPER'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Paper Trading Positions</span>
          <Badge variant="indigo" size="sm">
            {paperPositions.length} Active
          </Badge>
        </button>

        <button
          onClick={() => setActiveAccountTab('BROKER')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
            activeAccountTab === 'BROKER'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Broker Live Account (Kite)</span>
          <Badge variant="neutral" size="sm">
            Sandbox
          </Badge>
        </button>
      </div>

      {/* Add New Holding Form Drawer */}
      {showAddForm && activeAccountTab === 'MANUAL' && (
        <Card className="p-6 border-indigo-500/30 bg-indigo-500/5 space-y-4 animate-in fade-in zoom-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
            <div className="flex items-center space-x-2">
              <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Stock to Database Holdings
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
                placeholder="e.g. RELIANCE, TCS, INFY"
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
                step="1"
                min="1"
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
                min="0.01"
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
                {loadingAdd ? 'Saving...' : 'Save Holding'}
              </Button>
            </div>
          </form>

          {addError && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{addError}</p>}
        </Card>
      )}

      {/* VIEW 1: MANUAL HOLDINGS */}
      {activeAccountTab === 'MANUAL' && (
        <>
          {/* Top Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">Total Invested</span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  ₹{formatNumber(manualInvested)}
                </span>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">Current Value</span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
                  {manualCurrentVal !== null && manualCurrentVal !== undefined
                    ? `₹${formatNumber(manualCurrentVal)}`
                    : manualHoldings.length === 0
                    ? '₹0.00'
                    : 'Unavailable'}
                </span>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">Total P&amp;L</span>
              <div className="mt-3">
                {manualPnL !== null && manualPnL !== undefined ? (
                  <span
                    className={`text-h2 font-semibold ${
                      isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isPositive ? '+' : '−'}₹{formatNumber(Math.abs(manualPnL))}
                  </span>
                ) : (
                  <span className="text-sm text-slate-500">Unavailable</span>
                )}
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">Return Rate</span>
              <div className="mt-3 flex items-baseline space-x-2">
                <span
                  className={`text-h2 font-semibold ${
                    isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {manualPnLPct !== null && manualPnLPct !== undefined
                    ? `${isPositive ? '+' : ''}${manualPnLPct.toFixed(2)}%`
                    : '—'}
                </span>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <span className="text-caption text-slate-500 dark:text-slate-400 font-medium">Authoritative Positions</span>
              <div className="mt-3">
                <span className="text-h2 font-semibold text-indigo-600 dark:text-indigo-400">
                  {manualHoldings.length} Assets
                </span>
              </div>
            </Card>
          </div>

          {/* Holdings Table & Allocation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card size="large" noPadding className="lg:col-span-2 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-6 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Authoritative Database Holdings
                    </h3>
                    <p className="text-caption text-slate-500 dark:text-slate-400">
                      Synced across browsers and devices via PostgreSQL
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

                {manualHoldings.length === 0 ? (
                  <div className="p-12 text-center space-y-4">
                    <PieIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                    <div>
                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                        No Holdings Recorded In Database
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                        Add a holding with its symbol, quantity, and cost price to persist it securely.
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
                          <th className="text-right">P&amp;L</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualHoldings.map((h) => {
                          const invested = h.qty * h.avg_price;
                          const curVal = h.current_price !== null ? h.qty * h.current_price : null;
                          const pnl = curVal !== null ? curVal - invested : null;
                          const pnlPct = pnl !== null && invested > 0 ? ((pnl / invested) * 100).toFixed(2) : null;
                          const pos = (pnl ?? 0) >= 0;

                          return (
                            <tr key={h.symbol}>
                              <td>
                                <Link href={`/stocks/${h.symbol}`} className="group">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    {h.symbol}
                                  </div>
                                  <div className="text-caption text-slate-500 dark:text-slate-400">
                                    {h.name || h.symbol} • {h.source || 'verified'}
                                  </div>
                                </Link>
                              </td>
                              <td className="text-right font-medium">{h.qty}</td>
                              <td className="text-right text-slate-600 dark:text-slate-400">
                                ₹{formatNumber(h.avg_price)}
                              </td>
                              <td className="text-right font-semibold">
                                {h.current_price === null ? (
                                  <span className="text-xs text-amber-600 font-medium">Unavailable</span>
                                ) : (
                                  `₹${formatNumber(h.current_price)}`
                                )}
                              </td>
                              <td className="text-right font-medium text-slate-700 dark:text-slate-300">
                                ₹{formatNumber(invested)}
                              </td>
                              <td className="text-right">
                                {pnl === null ? (
                                  <span className="text-xs text-slate-400">—</span>
                                ) : (
                                  <>
                                    <div
                                      className={`font-semibold ${
                                        pos
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-red-600 dark:text-red-400'
                                      }`}
                                    >
                                      {pos ? '+' : '−'}₹{formatNumber(Math.abs(pnl))}
                                    </div>
                                    <div className="text-[10px]">
                                      <Badge variant={pos ? 'emerald' : 'red'} size="sm">
                                        {pos ? '+' : ''}
                                        {pnlPct}%
                                      </Badge>
                                    </div>
                                  </>
                                )}
                              </td>
                              <td className="text-right">
                                <button
                                  onClick={() => handleRemoveHolding(h.symbol)}
                                  className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                  aria-label={`Delete ${h.symbol} holding`}
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sector Breakdown</h3>
                  </div>
                  <span className="text-caption text-slate-500">Market Value Weight</span>
                </div>

                {Object.keys(sectorMap).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    {manualHoldings.length
                      ? 'Live quotes required for all positions to calculate allocation.'
                      : 'Add holdings to view sector allocation.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(sectorMap).map(([sec, val]) => (
                      <div key={sec} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">{sec}</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{val}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: PAPER TRADING POSITIONS */}
      {activeAccountTab === 'PAPER' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Paper Trading Simulated Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Positions derived dynamically from executed paper orders in the database order blotter.
                </p>
              </div>
              <Link href="/orders">
                <Button variant="primary" size="sm">
                  View Full Paper Blotter
                </Button>
              </Link>
            </div>

            {paperPositions.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Wallet className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  No Active Paper Trading Positions
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Execute buy orders on the Stock Analysis page or Blotter in PAPER mode to build your paper portfolio.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="sys-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="text-right">Net Qty</th>
                      <th className="text-right">Avg Cost</th>
                      <th className="text-right">LTP</th>
                      <th className="text-right">Cost Basis</th>
                      <th className="text-right">Current Value</th>
                      <th className="text-right">Unrealized P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperPositions.map((pos) => {
                      const hasLtp = pos.current_price !== null;
                      const isPos = (pos.pnl ?? 0) >= 0;
                      return (
                        <tr key={pos.symbol}>
                          <td className="font-bold text-slate-900 dark:text-slate-100">{pos.symbol}</td>
                          <td className="text-right font-medium">{pos.quantity}</td>
                          <td className="text-right">₹{formatNumber(pos.avg_price)}</td>
                          <td className="text-right font-semibold">
                            {hasLtp ? `₹${formatNumber(pos.current_price!)}` : 'Awaiting quote'}
                          </td>
                          <td className="text-right">₹{formatNumber(pos.invested)}</td>
                          <td className="text-right">
                            {pos.current_value !== null ? `₹${formatNumber(pos.current_value)}` : '—'}
                          </td>
                          <td className="text-right">
                            {pos.pnl !== null ? (
                              <span
                                className={`font-semibold ${
                                  isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {isPos ? '+' : '−'}₹{formatNumber(Math.abs(pos.pnl))} ({isPos ? '+' : ''}
                                {pos.pnl_pct?.toFixed(2)}%)
                              </span>
                            ) : (
                              '—'
                            )}
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
      )}

      {/* VIEW 3: BROKER LIVE ACCOUNT */}
      {activeAccountTab === 'BROKER' && (
        <Card className="p-8 text-center space-y-4">
          <ShieldCheck className="w-12 h-12 mx-auto text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Zerodha Kite Broker Connection
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Live broker trading requires an authenticated Zerodha Kite session with server-side API keys and token
            exchange.
          </p>
          <div className="pt-2">
            <Link href="/settings">
              <Button variant="outline" size="md">
                Manage Broker Connection in Settings →
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
