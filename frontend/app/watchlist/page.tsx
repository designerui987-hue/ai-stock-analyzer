// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { DEMO_STOCKS, formatNumber } from '@/lib/data';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const watchlistStocks = DEMO_STOCKS.slice(0, 8);

function getSignal(changePct: number) {
  if (changePct > 1.5) return { signal: 'BUY', color: 'text-accent-green bg-accent-green/10' };
  if (changePct < -0.5) return { signal: 'SELL', color: 'text-accent-red bg-accent-red/10' };
  return { signal: 'HOLD', color: 'text-accent-orange bg-accent-orange/10' };
}

export default function WatchlistPage() {
  return (
    <motion.div initial="initial" animate="animate" className="space-y-6 max-w-[1600px] mx-auto">
      <motion.div variants={fadeInUp} className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Watchlist</h2>
          <p className="text-sm text-dark-300">{watchlistStocks.length} stocks tracked</p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-accent text-sm font-medium hover:opacity-90 transition-all">
          + Add Stock
        </button>
      </motion.div>

      <motion.div variants={fadeInUp} transition={{ delay: 0.1 }}>
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-dark-300 border-b border-dark-600/30">
                <th className="text-left p-4 font-medium">Stock</th>
                <th className="text-right p-4 font-medium">Price</th>
                <th className="text-right p-4 font-medium">Change</th>
                <th className="text-right p-4 font-medium">Volume</th>
                <th className="text-right p-4 font-medium">Market Cap</th>
                <th className="text-center p-4 font-medium">AI Signal</th>
                <th className="text-center p-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {watchlistStocks.map((stock) => {
                const isPositive = stock.change_pct >= 0;
                const { signal, color } = getSignal(stock.change_pct);
                return (
                  <tr key={stock.symbol} className="border-b border-dark-600/10 hover:bg-dark-700/20 transition-colors">
                    <td className="p-4">
                      <Link href={`/stocks/${stock.symbol}`} className="hover:text-accent-blue transition-colors">
                        <div className="font-semibold text-sm">{stock.symbol}</div>
                        <div className="text-xs text-dark-400">{stock.name}</div>
                      </Link>
                    </td>
                    <td className="text-right p-4 font-medium text-sm">₹{formatNumber(stock.price)}</td>
                    <td className={`text-right p-4 text-sm font-semibold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                      {isPositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
                    </td>
                    <td className="text-right p-4 text-sm text-dark-300">{(stock.volume / 1000000).toFixed(1)}M</td>
                    <td className="text-right p-4 text-sm text-dark-300">{stock.market_cap}</td>
                    <td className="text-center p-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${color}`}>{signal}</span>
                    </td>
                    <td className="text-center p-4">
                      <Link href={`/stocks/${stock.symbol}`} className="text-xs text-accent-blue hover:underline">Analyze →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Quick AI Summary */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.2 }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-accent-green">
            {watchlistStocks.filter((s) => s.change_pct > 1.5).length}
          </div>
          <div className="text-xs text-dark-300 mt-1">BUY Signals</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-accent-orange">
            {watchlistStocks.filter((s) => s.change_pct >= -0.5 && s.change_pct <= 1.5).length}
          </div>
          <div className="text-xs text-dark-300 mt-1">HOLD Signals</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-accent-red">
            {watchlistStocks.filter((s) => s.change_pct < -0.5).length}
          </div>
          <div className="text-xs text-dark-300 mt-1">SELL Signals</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
