'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Search, Sun, Moon, Command } from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { evaluateNseSession } from '@/lib/orders/execution';
import { useAuth } from '@/store/useAuth';

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/dashboard': { title: 'Dashboard', sub: 'Institutional portfolio performance and AI signals' },
  '/portfolio': { title: 'Portfolio Management', sub: 'Asset allocation, holdings, and rebalancing recommendations' },
  '/portfolio/risk': { title: 'Portfolio Risk & Exposure', sub: 'Position sizing, portfolio heat %, and sector concentration alerts' },
  '/orders': { title: 'Orders', sub: 'Paper trades and Zerodha Kite orders' },
  '/watchlist': { title: 'Watchlist', sub: 'Real-time stock monitoring & alert triggers' },
  '/heatmap': { title: 'Market Heatmap', sub: 'Sector performance treemap & market cap visualization' },
  '/insights': { title: 'AI Insights', sub: 'Daily multi-model ensemble market signals & anomaly alerts' },
  '/performance': { title: 'Signal Performance Ledger', sub: 'Auditable track record of every AI signal issued with model factors' },
  '/assistant': { title: 'AI Copilot', sub: 'Interactive conversational stock analysis & reasoning' },
  '/settings': { title: 'Platform Settings', sub: 'Manage API credentials, alert delivery channels, and risk rules' },
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuth((state) => state.logout);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Default to Day Mode (Light Mode)
  const [isDarkMode, setIsDarkMode] = useState(false);

  const isStock = pathname.startsWith('/stocks/');
  const sym = isStock ? pathname.split('/')[2]?.toUpperCase() : null;
  const meta =
    PAGE_TITLES[pathname] ||
    (isStock && sym
      ? { title: `${sym} Analysis`, sub: 'NSE stock research' }
      : { title: 'StockAI Platform', sub: 'AI Market Intelligence' });

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (typeof document !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        document.body.style.background = '#0B0F17';
        document.body.style.color = '#F8FAFC';
      } else {
        document.documentElement.classList.remove('dark');
        document.body.style.background = '#F8FAFC';
        document.body.style.color = '#111827';
      }
    }
  };

  const [marketStatus, setMarketStatus] = useState<{
    open: boolean;
    session: string;
    label: string;
  }>(() => {
    const s = evaluateNseSession();
    let label = 'Market Closed';
    if (s.session === 'REGULAR') label = 'NSE Open';
    else if (s.session === 'SPECIAL_SESSION') label = 'NSE Special Session';
    else if (s.session === 'PRE_OPEN') label = 'NSE Pre-Open';
    else if (s.session === 'POST_CLOSE') label = 'NSE Post-Close';
    else if (s.session === 'WEEKEND') label = 'NSE Closed · Weekend';
    else if (s.session === 'HOLIDAY') label = 'NSE Closed · Holiday';

    return {
      open: s.open,
      session: s.session,
      label,
    };
  });

  useEffect(() => {
    const checkMarket = async () => {
      const s = evaluateNseSession();
      let label = 'Market Closed';
      if (s.session === 'REGULAR') label = 'NSE Open';
      else if (s.session === 'SPECIAL_SESSION') label = 'NSE Special Session';
      else if (s.session === 'PRE_OPEN') label = 'NSE Pre-Open';
      else if (s.session === 'POST_CLOSE') label = 'NSE Post-Close';
      else if (s.session === 'WEEKEND') label = 'NSE Closed · Weekend';
      else if (s.session === 'HOLIDAY') label = 'NSE Closed · Holiday';

      try {
        const res = await fetch('/api/market/overview', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.market_session) {
            const serverSession = data.market_session;
            const isOpen = Boolean(data.is_market_open);
            let sLabel = isOpen ? 'NSE Open' : 'Market Closed';
            if (serverSession === 'SPECIAL_SESSION') sLabel = 'NSE Special Session';
            if (serverSession === 'PRE_OPEN') sLabel = 'NSE Pre-Open';
            else if (serverSession === 'WEEKEND') sLabel = 'NSE Closed · Weekend';
            else if (serverSession === 'HOLIDAY') sLabel = 'NSE Closed · Holiday';
            else if (serverSession === 'POST_CLOSE') sLabel = 'NSE Post-Close';

            setMarketStatus({
              open: isOpen,
              session: serverSession,
              label: sLabel,
            });
            return;
          }
        }
      } catch {
        // Fallback to local evaluateNseSession
      }

      setMarketStatus({
        open: s.open,
        session: s.session,
        label,
      });
    };

    checkMarket();
    const timer = setInterval(checkMarket, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 sticky top-0 z-30 bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-colors">
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
              marketStatus.open
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                : marketStatus.session === 'PRE_OPEN'
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-white/5'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                marketStatus.open
                  ? 'bg-emerald-500 animate-pulse'
                  : marketStatus.session === 'PRE_OPEN'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span>{marketStatus.label}</span>
          </div>
        </div>

        {/* Search / Command Trigger & Utilities */}
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          {/* Quick Command Trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            aria-label="Search or jump to a page"
            className="flex items-center space-x-2 px-3 py-1.5 rounded-input bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 transition-all text-xs sm:w-48 lg:w-64"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:block flex-1 text-left truncate">Search or jump to...</span>
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

          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => { logout(); router.replace('/login'); }}
            className="p-2 rounded-input text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Command Palette Modal */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} onOpen={() => setCmdOpen(true)} />
    </>
  );
}
