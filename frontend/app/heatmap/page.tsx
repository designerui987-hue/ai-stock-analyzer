// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { DEMO_STOCKS } from '@/lib/data';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// Group stocks by sector for heatmap
function getHeatmapData() {
  const sectors: Record<string, any[]> = {};
  DEMO_STOCKS.forEach((s) => {
    if (!sectors[s.sector]) sectors[s.sector] = [];
    sectors[s.sector].push(s);
  });
  return sectors;
}

function getHeatColor(changePct: number): string {
  if (changePct > 2) return 'bg-green-500';
  if (changePct > 1) return 'bg-green-600/80';
  if (changePct > 0.5) return 'bg-green-700/60';
  if (changePct > 0) return 'bg-green-800/40';
  if (changePct > -0.5) return 'bg-red-800/40';
  if (changePct > -1) return 'bg-red-700/60';
  return 'bg-red-500';
}

export default function HeatmapPage() {
  const sectors = getHeatmapData();

  return (
    <motion.div initial="initial" animate="animate" className="space-y-6 max-w-[1600px] mx-auto">
      <motion.div variants={fadeInUp}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold">Market Heatmap</h2>
            <p className="text-sm text-dark-300">Visual representation of stock performance by sector</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-dark-300">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Loss</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-dark-600" /> Flat</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> Gain</span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} transition={{ delay: 0.1 }} className="space-y-4">
        {Object.entries(sectors).map(([sector, stocks]) => (
          <div key={sector}>
            <div className="text-sm font-medium text-dark-300 mb-2 px-1">{sector}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {stocks.map((stock) => {
                const isPositive = stock.change_pct >= 0;
                return (
                  <Link
                    key={stock.symbol}
                    href={`/stocks/${stock.symbol}`}
                    className={`${getHeatColor(stock.change_pct)} rounded-xl p-4 transition-all hover:scale-105 hover:shadow-lg group relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                      <div className="font-bold text-sm text-white">{stock.symbol}</div>
                      <div className="text-xs text-white/70 truncate">{stock.name}</div>
                      <div className="text-lg font-bold text-white mt-2">
                        {isPositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
                      </div>
                      <div className="text-xs text-white/60">₹{stock.price.toLocaleString()}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Sector Summary */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.2 }}>
        <div className="glass-card p-4">
          <h3 className="font-semibold mb-4">📊 Sector Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(sectors).map(([sector, stocks]) => {
              const avgChange = stocks.reduce((sum, s) => sum + s.change_pct, 0) / stocks.length;
              const isUp = avgChange >= 0;
              return (
                <div key={sector} className="p-3 rounded-xl bg-dark-700/30 border border-dark-600/20">
                  <div className="text-xs text-dark-300 mb-1">{sector}</div>
                  <div className={`text-sm font-bold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                    {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{avgChange.toFixed(2)}%
                  </div>
                  <div className="text-xs text-dark-400 mt-1">{stocks.length} stocks</div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
