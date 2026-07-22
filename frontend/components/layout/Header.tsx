'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Search, Sun, Moon, Command } from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { DEMO_STOCKS } from '@/lib/data';

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/dashboard': { title: 'Dashboard', sub: 'Institutional portfolio performance and AI signals' },
  '/portfolio': { title: 'Portfolio Management', sub: 'Asset allocation, holdings, and rebalancing recommendations' },
  '/watchlist': { title: 'Watchlist', sub: 'Real-time stock monitoring & alert triggers' },
  '/heatmap': { title: 'Market Heatmap', sub: 'Sector performance treemap & market cap visualization' },
  '/insights': { title: 'AI Insights', sub: 'Daily multi-model ensemble market signals & anomaly alerts' },
  '/assistant': { title: 'AI Copilot', sub: 'Interactive conversational stock analysis & reasoning' },
  '/settings': { title: 'Platform Settings', sub: 'Manage API credentials, alerts, and preferences' },
};

export default function Header() {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  // Default to Day Mode (Light Mode)
  const [isDarkMode, setIsDarkMode] = useState(false);

  const isStock = pathname.startsWith('/stocks/');
  const sym = isStock ? pathname.split('/')[2]?.toUpperCase() : null;
  const stock = sym ? DEMO_STOCKS.find((s) => s.symbol === sym) : null;
  const meta =
    PAGE_TITLES[pathname] ||
    (isStock && stock
      ? { title: `${stock.name} (${stock.symbol})`, sub: `${stock.sector} · Equity Analysis` }
      : { title: 'StockAI Platform', sub: 'AI Market Intelligence' });

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (typeof document !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const marketOpen = true;

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 shrink-0 sticky top-0 z-30 bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-colors">
        {/* Page Title & Subtitle */}
        <div className="flex items-center space-x-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {meta.title}
            </h1>
            <p className="text-caption text-slate-500 dark:text-slate-400 truncate">
              {meta.sub}
            </p>
          </div>

          <div
            className={`hidden md:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-caption font-medium border ${
              marketOpen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-white/5'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{marketOpen ? 'NSE Live' : 'Market Closed'}</span>
          </div>
        </div>

        {/* Search / Command Trigger & Utilities */}
        <div className="flex items-center space-x-3">
          {/* Quick Command Trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-input bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 transition-all text-xs w-48 sm:w-64"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left truncate">Search or jump to...</span>
            <kbd className="hidden sm:inline-flex items-center space-x-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-white/10 shadow-subtle">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </kbd>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-input text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            title={isDarkMode ? 'Switch to Day Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Notifications */}
          <button
            className="relative p-2 rounded-input text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
          </button>

          {/* User Avatar */}
          <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-xs font-semibold shrink-0 cursor-pointer shadow-subtle">
            AI
          </div>
        </div>
      </header>

      {/* Command Palette Modal */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
