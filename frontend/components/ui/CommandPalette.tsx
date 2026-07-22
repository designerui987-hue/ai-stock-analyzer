'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Bookmark,
  Bot,
  Sparkles,
  Grid,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const PAGES = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Portfolio', icon: PieChart, path: '/portfolio' },
    { name: 'Stock Analysis', icon: TrendingUp, path: '/stocks' },
    { name: 'Watchlist', icon: Bookmark, path: '/watchlist' },
    { name: 'AI Assistant', icon: Bot, path: '/assistant' },
    { name: 'AI Insights', icon: Sparkles, path: '/insights' },
    { name: 'Market Heatmap', icon: Grid, path: '/heatmap' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  const STOCKS = [
    { name: 'Reliance Industries', symbol: 'RELIANCE', sector: 'Energy' },
    { name: 'Tata Consultancy Services', symbol: 'TCS', sector: 'Technology' },
    { name: 'HDFC Bank', symbol: 'HDFCBANK', sector: 'Financials' },
    { name: 'Infosys Ltd', symbol: 'INFY', sector: 'Technology' },
    { name: 'Tata Motors', symbol: 'TATAMOTORS', sector: 'Automotive' },
    { name: 'ICICI Bank', symbol: 'ICICIBANK', sector: 'Financials' },
  ];

  const filteredPages = PAGES.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  const filteredStocks = STOCKS.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.symbol.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectPage = (path: string) => {
    router.push(path);
    onClose();
  };

  const handleSelectStock = (symbol: string) => {
    router.push(`/stocks?symbol=${symbol}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div
        className="w-full max-w-xl bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.08] rounded-card-lg shadow-elevation dark:shadow-dark-elevation overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b border-slate-200 dark:border-white/[0.06]">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search stocks..."
            className="w-full py-4 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-white/5">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {filteredPages.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Pages
              </div>
              {filteredPages.map((page) => {
                const Icon = page.icon;
                return (
                  <button
                    key={page.path}
                    onClick={() => handleSelectPage(page.path)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-btn text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                      <span>{page.name}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
                  </button>
                );
              })}
            </div>
          )}

          {filteredStocks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Stocks
              </div>
              {filteredStocks.map((stock) => (
                <button
                  key={stock.symbol}
                  onClick={() => handleSelectStock(stock.symbol)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-btn text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                      {stock.symbol}
                    </span>
                    <span>{stock.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{stock.sector}</span>
                </button>
              ))}
            </div>
          )}

          {filteredPages.length === 0 && filteredStocks.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">
              No results found for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
