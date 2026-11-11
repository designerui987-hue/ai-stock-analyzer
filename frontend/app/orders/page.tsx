'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '@/lib/api';
import Link from 'next/link';
import { ShoppingBag, RefreshCw, AlertTriangle, ExternalLink, ShieldAlert, CheckSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

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
  quote_as_of?: string | null;
  slippage_bps?: number | null;
  fees_inr?: number | null;
  status: string;
  placed_at: string;
}

const STATUS_BADGE_VARIANT: Record<string, 'emerald' | 'indigo' | 'amber' | 'red' | 'slate'> = {
  FILLED: 'emerald',
  COMPLETE: 'emerald',
  OPEN: 'indigo',
  PLACED: 'indigo',
  PARTIAL: 'amber',
  UNKNOWN: 'amber',
  REJECTED: 'red',
  CANCELLED: 'slate',
};

export default function OrdersPage() {
  const [modeTab, setModeTab] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [paperOrders, setPaperOrders] = useState<OrderItem[]>([]);
  const [liveOrders, setLiveOrders] = useState<OrderItem[]>([]);
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchOrders = useCallback(() => {
    setLoading(true);
    fetch('/api/broker/orders', { headers: auth.getAuthHeaders() })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setPaperOrders(Array.isArray(json.paper_orders) ? json.paper_orders : []);
          setLiveOrders(Array.isArray(json.live_orders) ? json.live_orders : []);
          setLiveTradingEnabled(Boolean(json.live_trading_enabled));
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleReconcile = async (orderId: string) => {
    setReconcilingId(orderId);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/orders', {
        method: 'PATCH',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(data.message || 'Order status reconciled with broker.');
        fetchOrders();
      } else {
        setFeedback(`Reconcile error: ${data.error || 'Failed to reconcile order.'}`);
      }
    } catch (err: any) {
      setFeedback(`Reconcile error: ${err?.message || 'Network failure'}`);
    } finally {
      setReconcilingId(null);
    }
  };

  const activeList = modeTab === 'PAPER' ? paperOrders : liveOrders;
  const filteredOrders = activeList.filter((o) => {
    if (statusFilter === 'ALL') return true;
    return o.status?.toUpperCase() === statusFilter;
  });

  const totalFees = activeList.reduce((acc, o) => acc + (typeof o.fees_inr === 'number' ? o.fees_inr : 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Order History & Execution Blotter
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Strictly segregated audit logs for simulated Paper Trading vs live Zerodha Kite orders.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchOrders}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Blotter
          </Button>

          <Link href="/settings">
            <Button variant="primary" size="sm">
              Broker Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Live Execution Gate Notice */}
      {!liveTradingEnabled && (
        <div className="p-3.5 rounded-card bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] flex items-start space-x-3 text-xs text-slate-700 dark:text-slate-300">
          <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Live Order Execution Disabled:</span> Real-money Kite order routing is gated off (`ENABLE_LIVE_TRADING` is disabled). Orders placed in this environment route to the realistic Paper Ledger only.
          </div>
        </div>
      )}

      {/* SEBI Advisory Disclaimer Banner */}
      <div className="p-3.5 rounded-card bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">SEBI Compliance & Not Investment Advice:</span> Paper and live blotters are never mixed. All orders require manual ticket confirmation against verified exchange quote timestamps.
        </div>
      </div>

      {/* Ledger Mode Switch (PAPER vs LIVE) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-white/[0.08]">
          <button
            onClick={() => {
              setModeTab('PAPER');
              setStatusFilter('ALL');
            }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${
              modeTab === 'PAPER'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            PAPER LEDGER ({paperOrders.length})
          </button>
          <button
            onClick={() => {
              setModeTab('LIVE');
              setStatusFilter('ALL');
            }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${
              modeTab === 'LIVE'
                ? 'bg-red-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            LIVE KITE ORDERS ({liveOrders.length})
          </button>
        </div>

        <div className="text-xs font-mono text-slate-500">
          {modeTab} Est. Statutory Fees Logged:{' '}
          <span className="font-bold text-slate-900 dark:text-slate-200">₹{totalFees.toFixed(2)}</span>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-card bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-800 dark:text-indigo-200">
          {feedback}
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-white/[0.08] pb-2">
        {['ALL', 'FILLED', 'OPEN', 'PARTIAL', 'UNKNOWN', 'REJECTED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              statusFilter === st
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Blotter Table */}
      <Card size="large" className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-white/[0.08] text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Ledger / Exch</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Fill / Limit Price</th>
                <th className="px-4 py-3 text-right">Fees / Slip</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Loading {modeTab.toLowerCase()} order blotter...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No {modeTab.toLowerCase()} orders matching status &quot;{statusFilter}&quot;.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isBuy = o.transaction_type === 'BUY';
                  const st = o.status?.toUpperCase() || 'UNKNOWN';
                  const needsReconcile = modeTab === 'LIVE' && (st === 'UNKNOWN' || st === 'OPEN' || st === 'PARTIAL');
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        <span className="block text-[10px] text-slate-400">
                          {new Date(o.placed_at).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant={modeTab === 'PAPER' ? 'indigo' : 'red'} size="sm">
                          {modeTab}
                        </Badge>
                        <span className="block text-[10px] font-mono text-slate-400 mt-0.5">
                          {o.exchange || 'NSE'} · {o.product_type}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                        <Link href={`/stocks/${o.symbol}`} className="hover:underline flex items-center gap-1">
                          {o.symbol} <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant={isBuy ? 'emerald' : 'red'} size="sm">
                          {o.transaction_type}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {o.quantity}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {o.order_type}
                        {o.trigger_price ? (
                          <span className="block text-[10px] font-mono text-slate-400">
                            Trig ₹{o.trigger_price.toFixed(2)}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {typeof o.price === 'number' ? `₹${o.price.toFixed(2)}` : 'Pending'}
                        {o.quote_as_of && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            as of {new Date(o.quote_as_of).toLocaleTimeString()}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {typeof o.fees_inr === 'number' ? `₹${o.fees_inr.toFixed(2)}` : '-'}
                        {typeof o.slippage_bps === 'number' && o.slippage_bps > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            {o.slippage_bps} bps
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {o.broker_order_id || '-'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={STATUS_BADGE_VARIANT[st] || 'slate'} size="sm">
                            {st}
                          </Badge>
                          {needsReconcile && (
                            <button
                              onClick={() => handleReconcile(o.id)}
                              disabled={reconcilingId === o.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 text-[10px] font-semibold"
                              title="Reconcile ambiguous or pending order against broker API"
                            >
                              <CheckSquare className="w-3 h-3" />
                              {reconcilingId === o.id ? '...' : 'Reconcile'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
