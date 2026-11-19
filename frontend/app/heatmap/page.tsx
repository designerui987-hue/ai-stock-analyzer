'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, Database, RefreshCw, ArrowLeft, Info } from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { formatINR, formatPercent } from '@/lib/format';
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
        if (isDemoAllowed) {
          setSectors(getDemoHeatmapData());
          setIsDemoData(true);
        } else {
          setError(err?.message || 'Failed to fetch heatmap data.');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHeatmap();
  }, []);

  const sectorNames = Object.keys(sectors);
  const displayedSectors = selectedSector
    ? { [selectedSector]: sectors[selectedSector] }
    : sectors;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Breadcrumb & Page Intro ───────────────────────────────────── */}
      <Link
        href="/stocks"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#687A81] hover:text-[#142B32] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Explore</span>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">SECTOR RELATIVE STRENGTH</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Market Heatmap.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            Compare sector breadth and constituent performance across Indian equities.
          </p>
        </div>

        <button
          onClick={fetchHeatmap}
          className="px-3 py-1.5 bg-white border border-[#E1E7E8] hover:bg-[#EEF2F2] rounded-[7px] text-xs font-semibold text-[#142B32] flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Coverage & Methodology Explainer Banner ───────────────────── */}
      <div className="p-4 bg-white border border-[#E1E7E8] rounded-[10px] text-xs text-[#687A81] space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-[#142B32]">
          <Info className="w-3.5 h-3.5 text-[#087F73]" />
          <span>Coverage Scope & Colour Scale</span>
        </div>
        <p className="leading-relaxed">
          Covers tracked NSE large and mid-cap constituent equities (not the entire exchange). Green tiles represent positive daily change; red represents negative daily change. Darker shading reflects greater percentage movement.
        </p>
      </div>

      {/* ── Sector Filter Chips ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter sectors">
        <button
          onClick={() => setSelectedSector(null)}
          className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all ${
            selectedSector === null
              ? 'bg-[#142B32] text-white border-[#142B32]'
              : 'bg-white text-[#687A81] border-[#E1E7E8] hover:text-[#142B32]'
          }`}
        >
          All Sectors ({sectorNames.length})
        </button>
        {sectorNames.map((sec) => (
          <button
            key={sec}
            onClick={() => setSelectedSector(sec)}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all ${
              selectedSector === sec
                ? 'bg-[#142B32] text-white border-[#142B32]'
                : 'bg-white text-[#687A81] border-[#E1E7E8] hover:text-[#142B32]'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-[#FAF3E5] border border-[#EEE2C6] rounded-[10px] text-xs text-[#8B734D] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Heatmap Grid ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white border border-[#E1E7E8] rounded-[14px] p-12 text-center text-xs text-[#687A81]">
          Loading sector performance treemap...
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(displayedSectors).map(([sectorName, stockItems]) => {
            if (!stockItems || stockItems.length === 0) return null;
            return (
              <section
                key={sectorName}
                className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[#E1E7E8] pb-3">
                  <h3 className="text-base font-semibold text-[#142B32]">{sectorName}</h3>
                  <span className="text-xs text-[#687A81]">{stockItems.length} constituents</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {stockItems.map((s: any) => {
                    const chg = s.change_pct ?? 0;
                    const isPositive = chg >= 0;

                    return (
                      <Link
                        key={s.symbol}
                        href={`/stocks/${s.symbol}`}
                        className={`p-3.5 rounded-[10px] border transition-all hover:-translate-y-0.5 ${
                          isPositive
                            ? 'bg-[#EAF2EC] border-[#D8E5DE] hover:border-[#087F73]'
                            : 'bg-[#FCEDEC] border-[#F5D3D2] hover:border-[#BB4B48]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-[#142B32]">{s.symbol}</span>
                          <span
                            className={`text-xs font-mono font-semibold ${
                              isPositive ? 'text-[#087F73]' : 'text-[#BB4B48]'
                            }`}
                          >
                            {formatPercent(chg)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#687A81] truncate mt-1">
                          {s.name || s.symbol}
                        </div>
                        {typeof s.price === 'number' && (
                          <div className="text-xs font-mono font-medium text-[#142B32] mt-1.5">
                            {formatINR(s.price, 2)}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="pt-4 border-t border-[#E1E7E8] flex items-center justify-between text-xs text-[#687A81]">
        <span>Source: {sourceInfo}</span>
        <span>{asOfInfo ? `As of ${new Date(asOfInfo).toLocaleTimeString('en-IN')}` : 'Market hours'}</span>
      </footer>
    </div>
  );
}
