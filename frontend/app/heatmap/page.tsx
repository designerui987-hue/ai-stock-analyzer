'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, Database, RefreshCw } from 'lucide-react';
import { DEMO_STOCKS } from '@/lib/data';

function getDemoHeatmapData() {
  const sectors: Record<string, any[]> = {};
  DEMO_STOCKS.forEach((s) => {
    if (!sectors[s.sector]) sectors[s.sector] = [];
    sectors[s.sector].push({
      ...s,
      change_pct: s.change_pct,
      demo: true,
    });
  });
  return sectors;
}

export default function HeatmapPage() {
  const isDemoAllowed = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const [sectors, setSectors] = useState<Record<string, any[]>>({});
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<string>('NSE / yfinance');
  const [asOfInfo, setAsOfInfo] = useState<string | null>(null);
  const [isDemoData, setIsDemoData] = useState(false);

  const fetchHeatmap = () => {
    setLoading(true);
    setError(null);
    import('@/lib/api')
      .then(({ api }) => api.getHeatmap())
      .then((data) => {
        if (!data || (Array.isArray(data) && data.length === 0)) {
          if (isDemoAllowed) {
            setSectors(getDemoHeatmapData());
            setIsDemoData(true);
            setSourceInfo('Demo Fixtures');
            setAsOfInfo(new Date().toISOString());
          } else {
            setSectors({});
            setError('Market sector heatmap data is currently unavailable. No verified constituent quotes received.');
          }
          return;
        }

        const grouped: Record<string, any[]> = {};
        let detectedSource = 'NSE / yfinance';
        let detectedAsOf: string | null = null;
        let hasDemo = false;

        const stockList: any[] = Array.isArray(data)
          ? data
          : typeof data === 'object'
          ? Object.values(data).flat()
          : [];

        stockList.forEach((s: any) => {
          if (!s || !s.symbol) return;
          const sec = s.sector || 'Other';
          if (!grouped[sec]) grouped[sec] = [];
          if (s.source) detectedSource = s.source;
          if (s.as_of) detectedAsOf = s.as_of;
          if (s.demo) hasDemo = true;

          const changePct =
            typeof s.change_pct === 'number'
              ? s.change_pct
              : typeof s.change_percent === 'number'
              ? s.change_percent
              : typeof s.change === 'number'
              ? s.change
              : 0;

          grouped[sec].push({
            ...s,
            change_pct: changePct,
          });
        });

        if (Object.keys(grouped).length === 0) {
          if (isDemoAllowed) {
            setSectors(getDemoHeatmapData());
            setIsDemoData(true);
          } else {
            setSectors({});
            setError('Market sector heatmap data is currently unavailable.');
          }
        } else {
          setSectors(grouped);
          setSourceInfo(detectedSource);
          setAsOfInfo(detectedAsOf);
          setIsDemoData(hasDemo);
        }
      })
      .catch((err) => {
        console.error('Heatmap fetch error:', err);
        if (isDemoAllowed) {
          setSectors(getDemoHeatmapData());
          setIsDemoData(true);
          setSourceInfo('Demo Fixtures (Fallback)');
          setAsOfInfo(new Date().toISOString());
        } else {
          setError('Unable to load market heatmap data. Please try again.');
          setSectors({});
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchHeatmap();
  }, []);

  const sectorKeys = Object.keys(sectors);
  const displaySectors = selectedSector
    ? { [selectedSector]: sectors[selectedSector] }
    : sectors;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Top Header & Sector Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
            Market Sector Heatmap
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            <span>Constituent performance grouped by industrial sector</span>
            {asOfInfo && (
              <span className="inline-flex items-center gap-1 text-caption text-slate-400">
                <Clock className="w-3 h-3" />
                {new Date(asOfInfo).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-caption text-slate-400">
              <Database className="w-3 h-3" />
              {sourceInfo}
            </span>
          </p>
        </div>

        {/* Refresh & Sector Filter Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={fetchHeatmap}
            title="Refresh Heatmap"
            className="p-1.5 rounded-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
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
              {sec} ({sectors[sec]?.length ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Demo Data Banner when active */}
      {isDemoData && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-3 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">DEMO DATA MODE:</span>
            <span>Displaying simulated constituents. Real quotes are unavailable for live rendering.</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold uppercase tracking-wider">
            DEMO
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && Object.keys(sectors).length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-white dark:bg-slate-900/40 rounded-card border border-slate-200 dark:border-white/[0.06]">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading sector constituent quotes…</p>
        </div>
      )}

      {/* Error / Unavailable State */}
      {!loading && error && (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/40 rounded-card border border-slate-200 dark:border-white/[0.06] space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{error}</p>
          <button
            onClick={fetchHeatmap}
            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Main Heatmap Grid */}
      <div className="space-y-6">
        {Object.entries(displaySectors).map(([sectorName, stocks]) => {
          if (!Array.isArray(stocks) || stocks.length === 0) return null;
          return (
            <div key={sectorName} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {sectorName}
                </h3>
                <span className="text-caption text-slate-500">{stocks.length} Companies</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {stocks.map((s) => {
                  const isUp = typeof s.change_pct === 'number' ? s.change_pct >= 0 : true;
                  return (
                    <Link key={s.symbol} href={`/stocks/${s.symbol}`}>
                      <div
                        className={`p-4 rounded-card flex flex-col justify-between h-28 border cursor-pointer transition-all duration-200 hover:-translate-y-[2px] ${
                          isUp
                            ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15 hover:border-emerald-500/30'
                            : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {s.symbol}
                            </span>
                            {s.demo && (
                              <span className="text-[9px] px-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-bold">
                                DEMO
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.name}</p>
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {typeof s.price === 'number' && s.price > 0 ? `₹${s.price.toFixed(2)}` : '—'}
                          </p>
                          <p
                            className={`text-xs font-semibold mt-0.5 ${
                              isUp
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {typeof s.change_pct === 'number'
                              ? `${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%`
                              : '0.00%'}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
