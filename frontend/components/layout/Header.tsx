'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bell, Menu, Command } from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { evaluateNseSession } from '@/lib/orders/execution';

const PAGE_BREADCRUMBS: Record<string, string> = {
  '/dashboard': 'Today',
  '/': 'Today',
  '/stocks': 'Explore',
  '/watchlist': 'Watchlist',
  '/portfolio': 'Portfolio',
  '/portfolio/risk': 'Portfolio / Risk & Context',
  '/orders': 'Portfolio / Orders',
  '/heatmap': 'Explore / Heatmap',
  '/backtest': 'Explore / Backtesting',
  '/performance': 'Explore / Signal Ledger',
  '/settings': 'Settings',
  '/data-sources': 'Settings / Data Sources',
  '/assistant': 'Research Assistant',
};

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);

  const isStock = pathname.startsWith('/stocks/');
  const symbol = isStock ? pathname.split('/')[2]?.toUpperCase() : null;

  let currentTitle = PAGE_BREADCRUMBS[pathname] || (isStock && symbol ? `Stock Research / ${symbol}` : 'Today');

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
        // Fallback
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
      <header className="h-[74px] px-6 md:px-9 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-30 bg-white border-b border-[#E1E7E8]">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-[#687A81] hover:text-[#142B32] rounded-md hover:bg-[#EEF2F2]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumb */}
        <div className="text-sm text-[#142B32] font-normal flex items-center gap-2 truncate">
          <span className="text-[#687A81]">Workspace</span>
          <span className="text-[#B6C2C6]">/</span>
          <strong className="font-semibold text-[#142B32]">{currentTitle}</strong>
        </div>

        {/* Search, Session tag & Alerts */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Quick search button */}
          <button
            onClick={() => setCmdOpen(true)}
            aria-label="Search a company"
            className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-white border border-[#E1E7E8] text-[#687A81] hover:border-[#CCD7D9] transition-all text-xs w-36 sm:w-56 lg:w-64"
          >
            <Search className="w-3.5 h-3.5 text-[#687A81] shrink-0" />
            <span className="truncate text-left flex-1">Search a company</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-[#EEF2F2] text-[#687A81] rounded border border-[#E1E7E8]">
              ⌘ K
            </kbd>
          </button>

          {/* Market Status Badge */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-xs font-medium border ${
              marketStatus.open
                ? 'bg-[#EAF2EC] text-[#087F73] border-[#D8E5DE]'
                : marketStatus.session === 'PRE_OPEN'
                ? 'bg-[#FAF3E5] text-[#8B734D] border-[#EEE2C6]'
                : 'bg-[#EEF2F2] text-[#687A81] border-[#E1E7E8]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                marketStatus.open
                  ? 'bg-[#087F73]'
                  : marketStatus.session === 'PRE_OPEN'
                  ? 'bg-[#8B734D]'
                  : 'bg-[#899DA3]'
              }`}
            />
            <span>{marketStatus.label}</span>
          </div>

          {/* Alerts / Bell Button */}
          <button
            onClick={() => router.push('/watchlist#alerts')}
            className="p-2 text-[#687A81] hover:text-[#142B32] rounded-[8px] hover:bg-[#EEF2F2] transition-colors relative"
            aria-label="Open alerts"
            title="Price Alerts"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Cmd + K Command Palette */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
