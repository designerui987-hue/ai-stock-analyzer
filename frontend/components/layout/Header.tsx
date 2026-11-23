'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Bell, Menu, Command, X, Trash2, CheckCircle2, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { evaluateNseSession } from '@/lib/orders/execution';
import { api, auth } from '@/lib/api';

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

  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(false);
  const [deletingAlertId, setDeletingAlertId] = useState<string | null>(null);
  const alertDropdownRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = useCallback(async () => {
    if (!auth.isAuthenticated()) {
      setAlerts([]);
      setAlertsError(false);
      return;
    }
    setAlertsLoading(true);
    setAlertsError(false);
    try {
      const data = await api.getAlerts();
      if (Array.isArray(data)) {
        setAlerts(data);
      }
    } catch {
      setAlertsError(true);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const handleUpdate = () => fetchAlerts();
    window.addEventListener('alerts-updated', handleUpdate);
    return () => window.removeEventListener('alerts-updated', handleUpdate);
  }, [fetchAlerts]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (alertDropdownRef.current && !alertDropdownRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    if (alertsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [alertsOpen]);

  const handleDeleteAlert = async (id: string | number) => {
    setDeletingAlertId(String(id));
    try {
      await api.deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => String(a.id) !== String(id)));
    } catch {
      // Ignore
    } finally {
      setDeletingAlertId(null);
    }
  };

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
        const data = await api.getMarketOverview().catch(() => null);
        if (data && data.market_session) {
          const serverSession = data.market_session;
          const isOpen = Boolean(data.is_market_open);
          let sLabel = isOpen ? 'NSE Open' : 'Market Closed';
          if (serverSession === 'SPECIAL_SESSION') sLabel = 'NSE Special Session';
          else if (serverSession === 'PRE_OPEN') sLabel = 'NSE Pre-Open';
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

          {/* Alerts / Bell Button & Dropdown */}
          <div className="relative" ref={alertDropdownRef}>
            <button
              onClick={() => {
                setAlertsOpen((prev) => !prev);
                if (!alertsOpen) fetchAlerts();
              }}
              className={`p-2 rounded-[8px] transition-colors relative ${
                alertsOpen ? 'bg-[#EEF2F2] text-[#142B32]' : 'text-[#687A81] hover:text-[#142B32] hover:bg-[#EEF2F2]'
              }`}
              aria-label="Open alerts"
              title="Price Alerts"
            >
              <Bell className="w-4 h-4" />
              {alerts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#087F73]" />
              )}
            </button>

            {/* Alerts Dropdown Popover */}
            {alertsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-[#E1E7E8] rounded-[14px] shadow-xl z-50 overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-[#E1E7E8] flex items-center justify-between bg-[#FAFBFA]">
                  <div>
                    <h3 className="text-sm font-semibold text-[#142B32]">Price Alerts</h3>
                    <p className="text-[11px] text-[#687A81] mt-0.5">
                      {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'} configured
                    </p>
                  </div>
                  <button
                    onClick={() => setAlertsOpen(false)}
                    className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[#EDF0F0]">
                  {alertsError ? (
                    <div className="p-6 text-center space-y-2">
                      <AlertTriangle className="w-5 h-5 text-[#BB4B48] mx-auto" />
                      <p className="text-xs font-semibold text-[#142B32]">Unable to load alerts</p>
                      <p className="text-[11px] text-[#687A81]">Check your connection or try again.</p>
                      <button
                        type="button"
                        onClick={() => fetchAlerts()}
                        className="mt-1 px-3 py-1 bg-white border border-[#E1E7E8] hover:bg-[#EEF2F2] rounded-[6px] text-xs font-medium text-[#142B32] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-[#087F73]" />
                        Retry
                      </button>
                    </div>
                  ) : alertsLoading ? (
                    <div className="p-8 text-center text-xs text-[#687A81] flex items-center justify-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#087F73]" />
                      Loading alerts…
                    </div>
                  ) : alerts.length > 0 ? (
                    alerts.map((a: any) => {
                      const isDelivered = a.status === 'DELIVERED';
                      const isTriggered = a.status === 'TRIGGERED';
                      const isDeleting = deletingAlertId === String(a.id);

                      return (
                        <div key={a.id} className="p-3.5 hover:bg-[#F9FBFA] transition-colors flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/stocks/${a.symbol}`}
                                onClick={() => setAlertsOpen(false)}
                                className="font-semibold text-xs text-[#142B32] hover:text-[#087F73] transition-colors"
                              >
                                {a.symbol}
                              </Link>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] border ${
                                  isDelivered
                                    ? 'bg-[#EAF2EC] text-[#087F73] border-[#D8E5DE]'
                                    : isTriggered
                                    ? 'bg-[#FAF3E5] text-[#8B734D] border-[#EEE2C6]'
                                    : 'bg-[#EEF2F2] text-[#142B32] border-[#E1E7E8]'
                                }`}
                              >
                                {a.status || 'SAVED'}
                              </span>
                            </div>
                            <div className="text-xs text-[#142B32] font-mono mt-0.5">
                              {a.price_target ? `Target: ₹${Number(a.price_target).toFixed(2)}` : (a.message || 'Price Alert')}
                            </div>
                            <div className="text-[10px] text-[#687A81] mt-0.5">
                              {a.time || (a.created_at ? new Date(a.created_at).toLocaleString('en-IN') : 'Recently')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteAlert(a.id)}
                            disabled={isDeleting}
                            aria-label={`Remove alert for ${a.symbol}`}
                            className="p-1.5 text-[#687A81] hover:text-[#BB4B48] rounded hover:bg-[#FAF3F0] transition-colors shrink-0 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center space-y-2">
                      <Bell className="w-6 h-6 text-[#899DA3] mx-auto opacity-50" />
                      <p className="text-xs font-semibold text-[#142B32]">No price alerts yet</p>
                      <p className="text-[11px] text-[#687A81] max-w-xs mx-auto">
                        Open any company research view and set a price target to receive threshold notifications.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Cmd + K Command Palette */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
