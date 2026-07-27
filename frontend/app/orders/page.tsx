'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowUpRight, ArrowDownRight, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface OrderItem {
  id: string;
  broker: string;
  symbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  order_type: string;
  price: number;
  product_type: string;
  source?: string;
  broker_order_id?: string;
  status: 'PLACED' | 'COMPLETE' | 'REJECTED' | 'CANCELLED';
  placed_at: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/broker/orders?userId=demo_user')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.orders) {
          setOrders(json.orders);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'ALL') return true;
    return o.status === statusFilter;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Order History & Blotter
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete audit trail of all orders executed through Zerodha Kite Connect.
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

      {/* SEBI Advisory Disclaimer Banner */}
      <div className="p-3.5 rounded-card bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">SEBI Compliance & Audit Notice:</span> All broker orders are placed at your sole manual discretion following explicit modal confirmation. Past AI signal performance does not guarantee future market returns.
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pb-2">
        {['ALL', 'COMPLETE', 'PLACED', 'REJECTED', 'CANCELLED'].map((st) => (
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
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Order Type</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Broker ID</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading order blotter...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No orders found matching status "{statusFilter}".
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isBuy = o.transaction_type === 'BUY';
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        <span className="block text-[10px] text-slate-400">
                          {new Date(o.placed_at).toLocaleDateString()}
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

                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                        {o.product_type}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {o.order_type}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        ₹{(o.price || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {o.broker_order_id || '-'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={
                            o.status === 'COMPLETE'
                              ? 'emerald'
                              : o.status === 'PLACED'
                              ? 'indigo'
                              : 'red'
                          }
                          size="sm"
                        >
                          {o.status}
                        </Badge>
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
