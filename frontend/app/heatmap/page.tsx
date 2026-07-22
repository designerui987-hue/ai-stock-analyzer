'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Grid, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DEMO_STOCKS } from '@/lib/data';

function getHeatmapData() {
  const sectors: Record<string, any[]> = {};
  DEMO_STOCKS.forEach((s) => {
    if (!sectors[s.sector]) sectors[s.sector] = [];
    sectors[s.sector].push(s);
  });
  return sectors;
}

export default function HeatmapPage() {
  const sectors = getHeatmapData();
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const sectorKeys = Object.keys(sectors);
  const displaySectors = selectedSector
    ? { [selectedSector]: sectors[selectedSector] }
    : sectors;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header & Sector Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
            Market Sector Heatmap
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time equity market visualization grouped by industrial sector
          </p>
        </div>

        {/* Sector Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSector(null)}
            className={`px-3 py-1.5 rounded-btn text-xs font-medium shrink-0 transition-colors ${
              selectedSector === null
                ? 'bg-indigo-600 text-white shadow-subtle'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All Sectors
          </button>
          {sectorKeys.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`px-3 py-1.5 rounded-btn text-xs font-medium shrink-0 transition-colors ${
                selectedSector === sec
                  ? 'bg-indigo-600 text-white shadow-subtle'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Main Heatmap Grid */}
      <div className="space-y-6">
        {Object.entries(displaySectors).map(([sectorName, stocks]) => (
          <div key={sectorName} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {sectorName}
              </h3>
              <span className="text-caption text-slate-500">{stocks.length} Companies</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {stocks.map((s) => {
                const isUp = s.change_pct >= 0;
                return (
                  <Link key={s.symbol} href={`/stocks/${s.symbol}`}>
                    <Card
                      interactive
                      className={`p-4 flex flex-col justify-between h-28 border ${
                        isUp
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {s.symbol}
                        </span>
                        <p className="text-caption text-slate-500 truncate">{s.name}</p>
                      </div>

                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-sm font-bold">
                          {isUp ? '+' : ''}
                          {s.change_pct.toFixed(2)}%
                        </span>
                        <span className="text-caption text-slate-500 font-medium">
                          ₹{s.price.toLocaleString()}
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
