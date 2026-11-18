'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, TrendingUp, ArrowRight, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const POPULAR_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy', exchange: 'NSE' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Technology', exchange: 'NSE' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financials', exchange: 'NSE' },
  { symbol: 'INFY', name: 'Infosys Ltd', sector: 'Technology', exchange: 'NSE' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Financials', exchange: 'NSE' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom', exchange: 'NSE' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials', exchange: 'NSE' },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', exchange: 'NSE' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'Capital Goods', exchange: 'NSE' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automotive', exchange: 'NSE' },
];

export default function StocksDirectoryPage() {
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  const sectors = ['ALL', 'Energy', 'Technology', 'Financials', 'Automotive', 'FMCG', 'Telecom', 'Capital Goods'];

  const filtered = POPULAR_STOCKS.filter((s) => {
    const matchesSearch =
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase());
    const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
              NSE Stock Analysis Universe
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Deterministic technical analysis, multi-timeframe indicators, and simulated order execution for Indian equities.
          </p>
        </div>

        <Link href="/stocks/RELIANCE">
          <Button variant="primary" size="md" icon={<ArrowRight className="w-4 h-4" />}>
            Open Featured (RELIANCE)
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by NSE symbol or company name (e.g. RELIANCE, TCS, Infosys)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-input text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`px-3 py-1.5 rounded-btn text-xs font-semibold transition-colors ${
                selectedSector === sec
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Stocks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((stock) => (
          <Link key={stock.symbol} href={`/stocks/${stock.symbol}`} className="group block">
            <Card className="h-full p-5 hover:border-indigo-500/50 transition-all hover:shadow-subtle">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-base text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {stock.symbol}
                    </span>
                    <Badge variant="neutral" size="sm">
                      {stock.exchange}
                    </Badge>
                  </div>
                  <h3 className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {stock.name}
                  </h3>
                </div>
                <Badge variant="indigo" size="sm">
                  {stock.sector}
                </Badge>
              </div>

              <div className="mt-6 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform">
                <span>View Real-Time Analysis</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="p-12 text-center space-y-3">
          <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No Instruments Matched Your Search
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query or clear sector filters.
          </p>
        </Card>
      )}

      {/* Informational Disclaimer */}
      <div className="p-4 rounded-card bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06] text-xs text-slate-500 flex items-center justify-between">
        <span>Engine: Deterministic Quant v1.0 • Multi-timeframe Technical Consensus</span>
        <span className="font-medium text-slate-600 dark:text-slate-400">Not Investment Advice</span>
      </div>
    </div>
  );
}
