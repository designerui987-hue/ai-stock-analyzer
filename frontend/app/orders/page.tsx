'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { formatINR, formatNumberIN } from '@/lib/format';
import { auth } from '@/lib/api';

interface OrderItem {
  id: string;
  broker: string;
  mode?: 'PAPER' | 'LIVE';
  exchange?: string;
  symbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  order_type: string;
  price: number | null;
  trigger_price?: number | null;
  product_type: string;
  source?: string;
  broker_order_id?: string;
  fees_inr?: number | null;
  status: string;
  placed_at: string;
}

export default function OrdersPage() {
  const [modeTab, setModeTab] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [paperOrders, setPaperOrders] = useState<OrderItem[]>([]);
  const [liveOrders, setLiveOrders] = useState<OrderItem[]>([]);
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/broker/orders', {
        headers: auth.getAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 401
            ? 'Sign in again to see your orders.'
            : 'Unable to load orders. Try refreshing.'
        );
      }
      setPaperOrders(Array.isArray(json.paper_orders) ? json.paper_orders : []);
      setLiveOrders(Array.isArray(json.live_orders) ? json.live_orders : []);
      setLiveTradingEnabled(Boolean(json.live_trading_enabled));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load orders.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchOrders(false);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [fetchOrders]);

  const handleOrderAction = async (orderId: string, action: 'reconcile' | 'cancel') => {
    setReconcilingId(orderId);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/orders', {
        method: 'PATCH',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(data.message || 'Order updated.');
      } else {
        setFeedback(data.error || 'Unable to update the order.');
      }
      void fetchOrders(false);
    } catch (err: any) {
      setFeedback(err?.message || 'Unable to update the order.');
    } finally {
      setReconcilingId(null);
    }
  };

  const currentList = modeTab === 'PAPER' ? paperOrders : liveOrders;
  const filteredOrders = currentList.filter((ord) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'OPEN') return ord.status === 'OPEN' || ord.status === 'ACCEPTED' || ord.status === 'PLACED';
    if (statusFilter === 'FILLED') return ord.status === 'FILLED' || ord.status === 'COMPLETE';
    if (statusFilter === 'CANCELLED') return ord.status === 'CANCELLED' || ord.status === 'REJECTED';
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Breadcrumb & Page Intro ───────────────────────────────────── */}
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#687A81] hover:text-[#142B32] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Portfolio</span>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">PORTFOLIO & EXECUTION</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Order Blotter.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            Paper trades, resting limit orders, and execution logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchOrders(true)}
            className="px-3 py-1.5 bg-white border border-[#E1E7E8] hover:bg-[#EEF2F2] rounded-[7px] text-xs font-semibold text-[#142B32] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Mode Switch & Filter Bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E7E8] pb-4">
        <div className="flex items-center gap-1 p-1 bg-[#EEF2F2] border border-[#E1E7E8] rounded-[9px]">
          <button
            onClick={() => setModeTab('PAPER')}
            className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${
              modeTab === 'PAPER'
                ? 'bg-white text-[#142B32] shadow-sm'
                : 'text-[#60737A] hover:text-[#142B32]'
            }`}
          >
            Paper Trading ({paperOrders.length})
          </button>
          <button
            onClick={() => setModeTab('LIVE')}
            className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-all ${
              modeTab === 'LIVE'
                ? 'bg-white text-[#142B32] shadow-sm'
                : 'text-[#60737A] hover:text-[#142B32]'
            }`}
          >
            Live Trading ({liveOrders.length})
          </button>
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1">
          {['ALL', 'OPEN', 'FILLED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-[6px] text-xs font-medium border transition-all ${
                statusFilter === st
                  ? 'bg-[#142B32] text-white border-[#142B32]'
                  : 'bg-white text-[#687A81] border-[#E1E7E8] hover:text-[#142B32]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live Trading Disabled Banner ────────────────────────────────── */}
      {modeTab === 'LIVE' && !liveTradingEnabled && (
        <div className="p-4 bg-[#FAF3E5] border border-[#EEE2C6] rounded-[10px] text-xs text-[#8B734D] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Real-money live order submission is disabled server-side (ENABLE_LIVE_TRADING=false). Orders remain simulated in paper mode.
          </span>
        </div>
      )}

      {/* ── Action Feedback Banner ──────────────────────────────────────── */}
      {feedback && (
        <div className="p-3 bg-[#EAF2EC] border border-[#D8E5DE] text-[#087F73] rounded-[8px] text-xs flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Orders Table ────────────────────────────────────────────────── */}
      {loading && currentList.length === 0 ? (
        <div className="bg-white border border-[#E1E7E8] rounded-[14px] p-8 text-center text-xs text-[#687A81]">
          Loading order blotter...
        </div>
      ) : filteredOrders.length === 0 ? (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-[#F0F5F3] text-[#087F73] border border-[#E1E7E8] mx-auto flex items-center justify-center">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold text-[#142B32]">
              No {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : ''} orders recorded
            </h2>
            <p className="text-xs text-[#687A81] max-w-sm mx-auto mt-2 leading-relaxed">
              Place a simulated paper limit or market trade from Company Research to view active resting orders and fills.
            </p>
          </div>
          <Link
            href="/stocks/RELIANCE"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[8px] text-xs font-semibold"
          >
            <span>Open Featured Stock</span>
          </Link>
        </section>
      ) : (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                  <th className="py-2.5 px-6 font-medium">Instrument</th>
                  <th className="py-2.5 px-6 font-medium">Side / Type</th>
                  <th className="py-2.5 px-6 text-right font-medium">Qty</th>
                  <th className="py-2.5 px-6 text-right font-medium">Price</th>
                  <th className="py-2.5 px-6 text-right font-medium">Fees</th>
                  <th className="py-2.5 px-6 font-medium">Status</th>
                  <th className="py-2.5 px-6 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF0F0]">
                {filteredOrders.map((ord) => {
                  const isBuy = ord.transaction_type === 'BUY';
                  const isFilled = ord.status === 'FILLED' || ord.status === 'COMPLETE';
                  const isOpen = ord.status === 'OPEN' || ord.status === 'ACCEPTED';

                  return (
                    <tr key={ord.id} className="hover:bg-[#F9FBFA] transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <StockLogo symbol={ord.symbol} size="sm" />
                          <div>
                            <Link
                              href={`/stocks/${ord.symbol}`}
                              className="font-semibold text-[#142B32] hover:text-[#087F73]"
                            >
                              {ord.symbol}
                            </Link>
                            <div className="text-[11px] text-[#687A81]">
                              {ord.broker} · {new Date(ord.placed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-6">
                        <span
                          className={`text-xs font-semibold ${
                            isBuy ? 'text-[#087F73]' : 'text-[#BB4B48]'
                          }`}
                        >
                          {ord.transaction_type}
                        </span>
                        <div className="text-[11px] text-[#687A81]">
                          {ord.order_type} · {ord.product_type}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-medium text-[#142B32]">
                        {ord.quantity}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-medium text-[#142B32]">
                        {typeof ord.price === 'number' ? formatINR(ord.price, 2) : 'Market'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono text-xs text-[#687A81]">
                        {typeof ord.fees_inr === 'number' ? formatINR(ord.fees_inr, 2) : '₹0.00'}
                      </td>
                      <td className="py-3.5 px-6">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isFilled
                              ? 'bg-[#EAF2EC] text-[#087F73]'
                              : isOpen
                              ? 'bg-[#E3F2ED] text-[#087F73]'
                              : ord.status === 'CANCELLED'
                              ? 'bg-[#EEF2F2] text-[#687A81]'
                              : 'bg-[#FCEDEC] text-[#BB4B48]'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        {isOpen ? (
                          <button
                            onClick={() => handleOrderAction(ord.id, 'cancel')}
                            disabled={reconcilingId === ord.id}
                            className="px-2.5 py-1 text-xs text-[#BB4B48] border border-[#E1E7E8] hover:bg-[#FCEDEC] rounded-[6px] font-medium"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-[#899DA3]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
