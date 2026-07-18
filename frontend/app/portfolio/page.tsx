// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { DEMO_PORTFOLIO, formatNumber } from '@/lib/data';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function PortfolioPage() {
  const p = DEMO_PORTFOLIO;
  const isPositive = p.total_pnl >= 0;

  return (
    <motion.div initial="initial" animate="animate" className="space-y-6 max-w-[1600px] mx-auto">
      {/* Portfolio Summary Cards */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Invested', value: `₹${(p.total_invested / 100000).toFixed(2)}L`, color: 'text-white' },
          { label: 'Current Value', value: `₹${(p.current_value / 100000).toFixed(2)}L`, color: 'text-white' },
          { label: 'Total P&L', value: `${isPositive ? '+' : ''}₹${(p.total_pnl / 1000).toFixed(1)}K`, sub: `${p.total_pnl_pct >= 0 ? '+' : ''}${p.total_pnl_pct}%`, color: isPositive ? 'text-accent-green' : 'text-accent-red' },
          { label: "Today's P&L", value: `${p.day_pnl >= 0 ? '+' : ''}₹${formatNumber(p.day_pnl)}`, sub: `${p.day_pnl_pct >= 0 ? '+' : ''}${p.day_pnl_pct}%`, color: p.day_pnl >= 0 ? 'text-accent-green' : 'text-accent-red' },
          { label: 'Holdings', value: p.holdings_count.toString(), color: 'text-accent-blue' },
        ].map((card, i) => (
          <div key={i} className="glass-card p-4">
            <div className="text-xs text-dark-300 mb-1">{card.label}</div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            {card.sub && <div className={`text-xs mt-1 ${card.color}`}>{card.sub}</div>}
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table */}
        <motion.div variants={fadeInUp} transition={{ delay: 0.1 }} className="lg:col-span-2">
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-dark-600/30">
              <h3 className="font-semibold">📋 Holdings</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-dark-300 border-b border-dark-600/20">
                    <th className="text-left p-3 font-medium">Stock</th>
                    <th className="text-right p-3 font-medium">Qty</th>
                    <th className="text-right p-3 font-medium">Avg Price</th>
                    <th className="text-right p-3 font-medium">CMP</th>
                    <th className="text-right p-3 font-medium">Invested</th>
                    <th className="text-right p-3 font-medium">Current</th>
                    <th className="text-right p-3 font-medium">P&L</th>
                    <th className="text-right p-3 font-medium">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {p.holdings.map((h) => {
                    const pos = h.pnl >= 0;
                    return (
                      <tr key={h.symbol} className="border-b border-dark-600/10 hover:bg-dark-700/20 transition-colors">
                        <td className="p-3">
                          <Link href={`/stocks/${h.symbol}`} className="hover:text-accent-blue transition-colors">
                            <div className="font-medium text-sm">{h.symbol}</div>
                            <div className="text-xs text-dark-400">{h.name}</div>
                          </Link>
                        </td>
                        <td className="text-right p-3 text-sm">{h.qty}</td>
                        <td className="text-right p-3 text-sm">₹{formatNumber(h.avg_price)}</td>
                        <td className="text-right p-3 text-sm font-medium">₹{formatNumber(h.current_price)}</td>
                        <td className="text-right p-3 text-sm text-dark-300">₹{(h.invested / 1000).toFixed(1)}K</td>
                        <td className="text-right p-3 text-sm">₹{(h.current_value / 1000).toFixed(1)}K</td>
                        <td className={`text-right p-3 text-sm font-medium ${pos ? 'text-accent-green' : 'text-accent-red'}`}>
                          {pos ? '+' : ''}₹{formatNumber(h.pnl)}
                        </td>
                        <td className={`text-right p-3 text-sm font-bold ${pos ? 'text-accent-green' : 'text-accent-red'}`}>
                          {pos ? '+' : ''}{h.pnl_pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Right Column */}
        <motion.div variants={fadeInUp} transition={{ delay: 0.2 }} className="space-y-6">
          {/* Sector Allocation */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">📊 Sector Allocation</h3>
            <div className="space-y-3">
              {Object.entries(p.sector_allocation)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([sector, pct]) => {
                  const colors = ['bg-accent-blue', 'bg-accent-purple', 'bg-accent-green', 'bg-accent-orange', 'bg-accent-cyan', 'bg-accent-pink'];
                  const idx = Object.keys(p.sector_allocation).indexOf(sector);
                  return (
                    <div key={sector}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-dark-200">{sector}</span>
                        <span className="font-medium">{pct as number}%</span>
                      </div>
                      <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[idx % colors.length]}`} style={{ width: `${pct as number}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">🤖 AI Suggestions</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                <div className="text-sm font-medium text-yellow-400">⚠️ High IT Concentration (32.5%)</div>
                <div className="text-xs text-dark-300 mt-1">Consider reducing IT exposure below 30% for better diversification.</div>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                <div className="text-sm font-medium text-accent-blue">📅 Rebalancing Due</div>
                <div className="text-xs text-dark-300 mt-1">Quarterly rebalancing recommended to maintain target allocations.</div>
              </div>
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/15">
                <div className="text-sm font-medium text-accent-green">💡 Add Healthcare</div>
                <div className="text-xs text-dark-300 mt-1">Consider pharma stocks for defensive positioning.</div>
              </div>
            </div>
          </div>

          {/* Performance Summary */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">🏆 Performance</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-300">Best Performer</span>
                <Link href={`/stocks/${p.top_performer}`} className="font-medium text-accent-green hover:underline">{p.top_performer}</Link>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-300">Underperformer</span>
                <Link href={`/stocks/${p.worst_performer}`} className="font-medium text-accent-orange hover:underline">{p.worst_performer}</Link>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-300">XIRR</span>
                <span className="font-medium text-accent-green">+14.2%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dark-300">Sharpe Ratio</span>
                <span className="font-medium">1.8</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
