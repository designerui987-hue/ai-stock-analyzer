'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Grid,
  BarChart2,
  Activity,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { formatINR, formatPercent } from '@/lib/format';
import { api } from '@/lib/api';

interface StockUniverseItem {
  symbol: string;
  name: string;
  sector: string;
  price?: number;
  change_pct?: number;
  stance?: string;
  tone?: string;
}

const STOCK_UNIVERSE: StockUniverseItem[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', price: 1359.4, change_pct: -0.26, stance: 'Mixed signals', tone: 'caution' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials', price: 809.0, change_pct: 0.11, stance: 'Improving trend', tone: '' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Technology', price: 2337.0, change_pct: -1.79, stance: 'Losing momentum', tone: 'caution' },
  { symbol: 'INFY', name: 'Infosys', sector: 'Technology', price: 1074.5, change_pct: -3.09, stance: 'Under pressure', tone: 'caution' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financials', price: 1591.7, change_pct: -0.6, stance: 'Mixed signals', tone: 'caution' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials', price: 1145.2, change_pct: 0.9, stance: 'Improving trend', tone: '' },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'Consumer', price: 298.25, change_pct: 0.56, stance: 'Steady trend', tone: '' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', price: 1178.9, change_pct: 1.94, stance: 'Steady trend', tone: '' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Automotive', price: 892.15, change_pct: 2.14, stance: 'Improving trend', tone: '' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Capital Goods', price: 3245.6, change_pct: 0.9, stance: 'Steady trend', tone: '' },
];

const SECTORS = ['All sectors', 'Financials', 'Technology', 'Energy', 'Consumer', 'Automotive', 'Telecom'];

export default function ExplorePage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-[#687A81]">Loading market exploration...</div>}>
      <ExploreContent />
    </React.Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const initialSector = searchParams?.get('sector') || 'All sectors';

  const [selectedSector, setSelectedSector] = useState<string>(initialSector);
  const [query, setQuery] = useState<string>('');
  const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({});

  useEffect(() => {
    // Fetch live quotes for universe items
    const fetchQuotes = async () => {
      try {
        const quotes: Record<string, any> = {};
        await Promise.all(
          STOCK_UNIVERSE.map(async (s) => {
            const q = await api.getQuoteData(s.symbol, 'NSE').catch(() => null);
            if (q && typeof q.price === 'number') {
              quotes[s.symbol] = q;
            }
          })
        );
        setLiveQuotes(quotes);
      } catch {
        // Keep initial universe values
      }
    };

    fetchQuotes();
  }, []);

  const filtered = STOCK_UNIVERSE.filter((s) => {
    const matchesSector = selectedSector === 'All sectors' || s.sector === selectedSector;
    const matchesQuery =
      !query.trim() ||
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase());
    return matchesSector && matchesQuery;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Intro ─────────────────────────────────────────────────── */}
      <div>
        <div className="eyebrow text-[#687A81] mb-2">FIND YOUR NEXT QUESTION</div>
        <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
          Explore the market.
        </h1>
        <p className="text-sm text-[#687A81] mt-1.5">
          Start with a company. Follow the evidence.
        </p>
      </div>

      {/* ── Filter Bar & Search ────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter sectors"
      >
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSector(s)}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all ${
              selectedSector === s
                ? 'bg-[#142B32] text-white border-[#142B32]'
                : 'bg-white text-[#60737A] border-[#E1E7E8] hover:text-[#142B32]'
            }`}
            aria-pressed={selectedSector === s}
          >
            {s}
          </button>
        ))}

        <div className="ml-auto w-full sm:w-64 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#687A81]" />
          <input
            type="text"
            placeholder="Filter companies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E1E7E8] rounded-[7px] text-xs text-[#142B32] placeholder:text-[#687A81] focus:outline-none focus:ring-2 focus:ring-[#087F73]/30"
          />
        </div>
      </div>

      {/* ── Discover Layout (Table + Context Panel) ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-6">
        {/* Left Column: Stocks Table */}
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] overflow-hidden">
          <div className="p-5 md:p-6 pb-4 flex items-center justify-between border-b border-[#E1E7E8]">
            <div>
              <h2 className="text-[20px] font-semibold text-[#142B32]">
                {selectedSector === 'All sectors' ? 'Companies in focus' : selectedSector}
              </h2>
              <div className="text-xs text-[#687A81] mt-0.5">
                {filtered.length} companies · NSE equities
              </div>
            </div>
            <span className="text-xs text-[#687A81]">Today’s move</span>
          </div>

          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E1E7E8] bg-[#FAFBFA] text-[11px] uppercase tracking-wider text-[#687A81]">
                    <th className="py-2.5 px-6 font-medium">Company</th>
                    <th className="py-2.5 px-6 text-right font-medium">Price / Today</th>
                    <th className="py-2.5 px-6 font-medium hidden sm:table-cell">Research view</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF0F0]">
                  {filtered.map((x) => {
                    const lq = liveQuotes[x.symbol];
                    const price = typeof lq?.price === 'number' ? lq.price : x.price;
                    const chg = typeof lq?.change_percent === 'number' ? lq.change_percent : (x.change_pct ?? 0);
                    const isUp = chg >= 0;

                    return (
                      <tr key={x.symbol} className="hover:bg-[#F9FBFA] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <StockLogo symbol={x.symbol} size="sm" />
                            <div>
                              <Link
                                href={`/stocks/${x.symbol}`}
                                className="font-semibold text-[#142B32] hover:text-[#087F73] transition-colors"
                              >
                                {x.symbol}
                              </Link>
                              <div className="text-xs text-[#687A81]">{x.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono">
                          <div className="font-semibold text-[#142B32]">
                            {typeof price === 'number' ? formatINR(price, 2) : '—'}
                          </div>
                          <div
                            className={`text-xs ${
                              isUp ? 'text-[#087F73]' : 'text-[#BB4B48]'
                            }`}
                          >
                            {typeof price === 'number' ? formatPercent(chg) : '—'}
                          </div>
                        </td>
                        <td className="py-3.5 px-6 hidden sm:table-cell">
                          <span className={`stance ${x.tone || ''}`}>{x.stance}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-[#687A81] space-y-2">
              <p className="font-medium text-sm text-[#142B32]">No matching companies found</p>
              <p>Try searching for another symbol or selecting a different sector.</p>
            </div>
          )}

          <div className="p-4 px-6 border-t border-[#E1E7E8] text-xs text-[#687A81] bg-[#FAFBFA] flex items-center justify-between">
            <span>Deterministic rule observations</span>
            <span>{filtered.length} visible</span>
          </div>
        </section>

        {/* Right Column: Context Panel */}
        <aside className="bg-[#EAF2EC] border border-[#D8E5DE] rounded-[14px] p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <div className="eyebrow text-[#53705B] mb-2">A BETTER STARTING POINT</div>
              <h2 className="text-[22px] font-semibold text-[#142B32] leading-tight">
                A stock moves.<br />A story develops.
              </h2>
              <p className="text-xs text-[#4E685A] mt-2.5 leading-relaxed">
                Price is one piece of the picture. Open a company to see its trend, the supporting evidence, and what could go wrong.
              </p>
            </div>

            <div className="pt-4 border-t border-[#CFDFD3] space-y-2">
              <span className="text-xs font-semibold text-[#53705B] block">
                Three questions to bring
              </span>
              <ul className="text-xs text-[#4E685A] space-y-1.5 list-disc list-inside">
                <li>What changed?</li>
                <li>What supports the move?</li>
                <li>What might I be missing?</li>
              </ul>
            </div>
          </div>

          {/* Contextual links to Advanced Research */}
          <div className="pt-4 border-t border-[#CFDFD3] space-y-2.5">
            <span className="text-xs font-semibold text-[#53705B] block">
              Market Research Tools
            </span>
            <div className="flex flex-col gap-2 text-xs font-medium">
              <Link
                href="/heatmap"
                className="text-[#087F73] hover:underline flex items-center justify-between bg-white/70 p-2 rounded-[6px] border border-[#D8E5DE]"
              >
                <span className="flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5" />
                  <span>Market Heatmap</span>
                </span>
                <span className="text-[#64806F]">→</span>
              </Link>
              <Link
                href="/backtest"
                className="text-[#087F73] hover:underline flex items-center justify-between bg-white/70 p-2 rounded-[6px] border border-[#D8E5DE]"
              >
                <span className="flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Backtest Engine</span>
                </span>
                <span className="text-[#64806F]">→</span>
              </Link>
              <Link
                href="/performance"
                className="text-[#087F73] hover:underline flex items-center justify-between bg-white/70 p-2 rounded-[6px] border border-[#D8E5DE]"
              >
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Signal Ledger</span>
                </span>
                <span className="text-[#64806F]">→</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
