'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Shield,
  Layers,
  X,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { formatINR, formatNumberIN, formatPercent } from '@/lib/format';
import { api, auth } from '@/lib/api';
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
  sector?: string;
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
  if (!accountId) {
    return (
      <div className="p-8 text-center text-xs text-[#687A81]">
        Loading your portfolio…
      </div>
    );
  }
  return <AccountPortfolio accountId={accountId} storageKey={`portfolio-holdings:${accountId}`} />;
}

function AccountPortfolio({ accountId, storageKey }: { accountId: string; storageKey: string }) {
  const [activeTab, setActiveTab] = useState<'MANUAL' | 'PAPER' | 'BROKER'>('MANUAL');
  const [portfolio, setPortfolio] = useState<any>(null);
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([]);
  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form State
  const [symbolInput, setSymbolInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchPortfolioData = useCallback(async () => {
    try {
      setLoading(true);
      const [portRes, paperAccountRes, brokerRes] = await Promise.all([
        api.getPortfolio().catch(() => null),
        fetch('/api/broker/paper-account', { headers: auth.getAuthHeaders() })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch('/api/broker/connection', { headers: auth.getAuthHeaders() })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (portRes && Array.isArray(portRes.holdings)) {
        setPortfolio(portRes);
      }

      if (paperAccountRes?.success && paperAccountRes?.account?.positions) {
        const canonical: PaperPosition[] = Object.values(paperAccountRes.account.positions)
          .filter((p: any) => p.quantity > 0)
          .map((p: any) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            avg_price: p.avg_price,
            current_price: null,
            invested: p.total_invested,
            current_value: null,
            pnl: null,
            pnl_pct: null,
          }));

        // Fetch live quotes for paper positions
        await Promise.all(
          canonical.map(async (pos) => {
            const q = await api.getQuoteData(pos.symbol, 'NSE').catch(() => null);
            if (q && typeof q.price === 'number') {
              pos.current_price = q.price;
              pos.current_value = q.price * pos.quantity;
              pos.pnl = pos.current_value - pos.invested;
              pos.pnl_pct = pos.invested > 0 ? (pos.pnl / pos.invested) * 100 : 0;
            }
          })
        );

        setPaperPositions(canonical);
      }

      if (brokerRes?.success && brokerRes?.connected && brokerRes?.connection?.broker === 'KITE') {
        setBrokerConnected(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    const qty = parseInt(qtyInput, 10);
    const avg = parseFloat(priceInput);

    if (!sym || isNaN(qty) || qty <= 0 || isNaN(avg) || avg <= 0) {
      setFormError('Please enter a valid symbol, whole share quantity, and positive price.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await api.addHolding(sym, qty, avg);
      if (res && res.error) {
        setFormError(res.error);
      } else {
        setShowAddModal(false);
        setSymbolInput('');
        setQtyInput('');
        setPriceInput('');
        await fetchPortfolioData();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save holding to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveHolding = async (sym: string) => {
    try {
      await api.removeHolding(sym);
      await fetchPortfolioData();
    } catch {
      // Ignore
    }
  };

  // Derive metrics for active tab
  const activeHoldings = useMemo(() => {
    if (activeTab === 'MANUAL') {
      return (portfolio?.holdings || []).map((h: any) => ({
        symbol: h.symbol,
        name: h.name || h.symbol,
        qty: h.qty,
        avg_price: h.avg_price,
        current_price: h.current_price,
        invested: h.invested || h.qty * h.avg_price,
        current_value: h.current_value || (h.current_price ? h.current_price * h.qty : null),
        pnl: h.pnl,
        pnl_pct: h.pnl_pct,
        sector: h.sector || 'Equities',
      }));
    }
    if (activeTab === 'PAPER') {
      return paperPositions.map((p) => ({
        symbol: p.symbol,
        name: p.symbol,
        qty: p.quantity,
        avg_price: p.avg_price,
        current_price: p.current_price,
        invested: p.invested,
        current_value: p.current_value || (p.current_price ? p.current_price * p.quantity : null),
        pnl: p.pnl,
        pnl_pct: p.pnl_pct,
        sector: 'Equities',
      }));
    }
    return [];
  }, [activeTab, portfolio, paperPositions]);

  const { totalInvested, totalCurrentValue, totalPnl, totalPnlPct } = useMemo(() => {
    let invested = 0;
    let current = 0;
    activeHoldings.forEach((h: any) => {
      invested += h.invested || 0;
      current += h.current_value || h.invested || 0;
    });
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return {
      totalInvested: invested,
      totalCurrentValue: current,
      totalPnl: pnl,
      totalPnlPct: pnlPct,
    };
  }, [activeHoldings]);

  // Sector breakdown
  const sectors = useMemo(() => {
    const map: Record<string, number> = {};
    activeHoldings.forEach((h: any) => {
      const sec = h.sector || 'Equities';
      const val = h.current_value || h.invested || 0;
      map[sec] = (map[sec] || 0) + val;
    });
    return map;
  }, [activeHoldings]);

  const hasHoldings = activeHoldings.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Intro ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">YOUR INVESTMENTS, IN CONTEXT</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            See the whole picture.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            Holdings, performance, and the exposure behind them.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'MANUAL' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add a holding</span>
            </button>
          )}
          {activeTab === 'PAPER' && (
            <Link
              href="/orders"
              className="px-3.5 py-1.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Order Blotter</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Account Tabs: Manual Holdings vs Paper Positions vs Broker ── */}
      <div className="flex items-center gap-1 p-1 bg-[#EEF2F2] border border-[#E1E7E8] rounded-[9px] w-fit">
        <button
          onClick={() => setActiveTab('MANUAL')}
          className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${
            activeTab === 'MANUAL'
              ? 'bg-white text-[#142B32] shadow-sm'
              : 'text-[#60737A] hover:text-[#142B32]'
          }`}
        >
          Manual Holdings
        </button>
        <button
          onClick={() => setActiveTab('PAPER')}
          className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${
            activeTab === 'PAPER'
              ? 'bg-white text-[#142B32] shadow-sm'
              : 'text-[#60737A] hover:text-[#142B32]'
          }`}
        >
          Paper Account ({paperPositions.length})
        </button>
        <button
          onClick={() => setActiveTab('BROKER')}
          className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${
            activeTab === 'BROKER'
              ? 'bg-white text-[#142B32] shadow-sm'
              : 'text-[#60737A] hover:text-[#142B32]'
          }`}
        >
          Broker (Kite)
        </button>
      </div>

      {/* ── Add Holding Modal ───────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0c232c]/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] max-w-sm w-full p-6 shadow-2xl border border-[#E1E7E8] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E7E8] pb-3">
              <h3 className="text-base font-semibold text-[#142B32]">Add a Holding</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormError(null);
                }}
                className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddHolding} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#142B32] block mb-1">
                  NSE Symbol
                </label>
                <input
                  type="text"
                  placeholder="e.g. RELIANCE, TCS, INFY"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                  required
                  className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs uppercase bg-white text-[#142B32]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#142B32] block mb-1">
                    Shares Held
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 25"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    required
                    className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs font-mono bg-white text-[#142B32]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#142B32] block mb-1">
                    Avg Buy Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.01}
                    placeholder="e.g. 1350"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    required
                    className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs font-mono bg-white text-[#142B32]"
                  />
                </div>
              </div>

              {formError && <p className="text-xs text-[#BB4B48]">{formError}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-[#087F73] hover:bg-[#076f64] text-white rounded-[7px] text-xs font-semibold disabled:opacity-50"
              >
                {isSubmitting ? 'Saving Holding...' : 'Save Holding'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Loading State ──────────────────────────────────────────────── */}
      {loading && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#087F73] mx-auto" />
          <p className="text-xs text-[#687A81]">Loading your verified portfolio holdings…</p>
        </section>
      )}

      {/* ── Broker Tab Disconnected State ───────────────────────────────── */}
      {activeTab === 'BROKER' && !loading && !brokerConnected && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-[#F0F5F3] text-[#087F73] border border-[#E1E7E8] mx-auto flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold text-[#142B32]">
              Connect Zerodha Kite
            </h2>
            <p className="text-xs text-[#687A81] max-w-sm mx-auto mt-2 leading-relaxed">
              Connect your broker credentials to synchronize demat holdings and live positions.
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold"
          >
            <span>Open Broker Settings</span>
          </Link>
        </section>
      )}

      {/* ── Empty State for Manual / Paper ──────────────────────────────── */}
      {activeTab !== 'BROKER' && !loading && !hasHoldings && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-[#F0F5F3] text-[#087F73] border border-[#E1E7E8] mx-auto flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold text-[#142B32]">
              Make this view yours.
            </h2>
            <p className="text-xs text-[#687A81] max-w-sm mx-auto mt-2 leading-relaxed">
              {activeTab === 'MANUAL'
                ? 'Add your current holdings to see their total value and your sector exposure.'
                : 'Execute your first simulated paper order from Company Research to view active virtual positions.'}
            </p>
          </div>
          {activeTab === 'MANUAL' ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add your first holding</span>
            </button>
          ) : (
            <Link
              href="/stocks/RELIANCE"
              className="px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <span>Explore Stocks & Trade Paper</span>
            </Link>
          )}
        </section>
      )}

      {/* ── Populated Portfolio Layout ──────────────────────────────────── */}
      {hasHoldings && (
        <>
          {/* Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#E1E7E8] border border-[#E1E7E8] rounded-[12px] overflow-hidden">
            <div className="bg-white p-6">
              <p className="text-xs text-[#687A81] mb-1">Current value</p>
              <strong className="text-[28px] font-semibold text-[#142B32] font-mono tracking-tight block">
                {formatINR(totalCurrentValue, 2)}
              </strong>
              <span className="text-[11px] text-[#687A81] mt-1 block">Based on latest quotes</span>
            </div>

            <div className="bg-white p-6">
              <p className="text-xs text-[#687A81] mb-1">Amount invested</p>
              <strong className="text-[28px] font-semibold text-[#142B32] font-mono tracking-tight block">
                {formatINR(totalInvested, 2)}
              </strong>
              <span className="text-[11px] text-[#687A81] mt-1 block">Cost basis</span>
            </div>

            <div className="bg-white p-6">
              <p className="text-xs text-[#687A81] mb-1">Unrealised return</p>
              <strong
                className={`text-[28px] font-semibold font-mono tracking-tight block ${
                  totalPnl >= 0 ? 'text-[#087F73]' : 'text-[#BB4B48]'
                }`}
              >
                {totalPnl >= 0 ? '+' : ''}
                {formatINR(totalPnl, 2)}
              </strong>
              <span className="text-[11px] text-[#687A81] mt-1 block">
                {formatPercent(totalPnlPct)} · before fees
              </span>
            </div>
          </div>

          {/* Holdings Grid + Sector Exposure */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6">
            {/* Holdings Table */}
            <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden">
              <div className="p-5 md:p-6 pb-4 flex items-center justify-between border-b border-[#E1E7E8]">
                <h2 className="text-[20px] font-semibold text-[#142B32]">Your holdings</h2>
                <span className="text-xs text-[#687A81]">
                  {activeTab === 'MANUAL' ? 'Manual Entries' : 'Paper Positions'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                      <th className="py-2.5 px-6 font-medium">Company</th>
                      <th className="py-2.5 px-6 text-right font-medium">Value / Return</th>
                      {activeTab === 'MANUAL' && (
                        <th className="py-2.5 px-6 text-right font-medium">
                          <span className="sr-only">Remove</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDF0F0]">
                    {activeHoldings.map((h: any) => {
                      const pnl = (h.current_value || h.invested) - h.invested;
                      const isUp = pnl >= 0;

                      return (
                        <tr key={h.symbol} className="hover:bg-[#F9FBFA] transition-colors">
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              <StockLogo symbol={h.symbol} size="sm" />
                              <div>
                                <Link
                                  href={`/stocks/${h.symbol}`}
                                  className="font-semibold text-[#142B32] hover:text-[#087F73] transition-colors"
                                >
                                  {h.symbol}
                                </Link>
                                <div className="text-xs text-[#687A81]">
                                  {h.qty} shares · avg. {formatINR(h.avg_price, 2)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-6 text-right font-mono">
                            <div className="font-semibold text-[#142B32]">
                              {formatINR(h.current_value || h.invested, 2)}
                            </div>
                            <div
                              className={`text-xs ${
                                isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                              }`}
                            >
                              {isUp ? '+' : ''}
                              {formatINR(pnl, 2)}
                            </div>
                          </td>
                          {activeTab === 'MANUAL' && (
                            <td className="py-3.5 px-6 text-right">
                              <button
                                onClick={() => handleRemoveHolding(h.symbol)}
                                className="p-1.5 text-[#687A81] hover:text-[#BB4B48] rounded hover:bg-[#EEF2F2] transition-colors"
                                aria-label={`Remove ${h.symbol}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Sector Exposure Aside */}
            <aside className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#142B32]">Sector exposure</h2>
                <p className="text-xs text-[#687A81] mt-0.5">By current portfolio value</p>
              </div>

              {/* Allocation Color Bar */}
              <div className="h-3 flex rounded-[4px] overflow-hidden my-4 bg-[#EEF2F2]">
                {Object.entries(sectors).map(([sec, val], idx) => {
                  const pct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
                  const colors = ['#087F73', '#406282', '#987433', '#8F6A24', '#687A81'];
                  return (
                    <span
                      key={sec}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: colors[idx % colors.length],
                      }}
                      title={`${sec}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>

              {/* Allocation List */}
              <div className="divide-y divide-[#E1E7E8] text-xs">
                {Object.entries(sectors).map(([sec, val]) => {
                  const pct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
                  return (
                    <div key={sec} className="py-2.5 flex items-center justify-between">
                      <span className="text-[#687A81]">{sec}</span>
                      <strong className="font-mono text-[#142B32]">{pct.toFixed(1)}%</strong>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-[#E1E7E8]">
                <Link
                  href="/portfolio/risk"
                  className="text-xs font-semibold text-[#087F73] hover:underline block"
                >
                  View full concentration & heat analysis →
                </Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
