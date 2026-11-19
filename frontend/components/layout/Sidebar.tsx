'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Compass,
  Bookmark,
  Briefcase,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { openResearchCompanion } from '@/components/layout/ResearchCompanionDrawer';
import { api, auth } from '@/lib/api';
import { clsx } from 'clsx';

const PRIMARY_NAV = [
  { href: '/dashboard', aliases: ['/', '/dashboard'], icon: Home, label: 'Today' },
  { href: '/stocks', aliases: ['/stocks', '/heatmap'], icon: Compass, label: 'Explore' },
  { href: '/watchlist', aliases: ['/watchlist'], icon: Bookmark, label: 'Watchlist', hasCount: true },
  { href: '/portfolio', aliases: ['/portfolio', '/orders', '/portfolio/risk'], icon: Briefcase, label: 'Portfolio' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [watchCount, setWatchCount] = useState<number | null>(null);
  const [username, setUsername] = useState<string>('User');

  useEffect(() => {
    // Read watchlist count & user
    const checkUserAndWatchlist = async () => {
      try {
        const u = auth.getUser();
        if (u?.username) setUsername(u.username);

        const res = await api.getWatchlist().catch(() => null);
        if (res?.success && Array.isArray(res.items)) {
          setWatchCount(res.items.length);
        } else if (res && Array.isArray(res)) {
          setWatchCount(res.length);
        }
      } catch {
        // Leave count as null if unresolvable
      }
    };
    checkUserAndWatchlist();

    const handleUpdate = () => {
      checkUserAndWatchlist();
    };
    window.addEventListener('watchlist-updated', handleUpdate);
    return () => window.removeEventListener('watchlist-updated', handleUpdate);
  }, [pathname]);

  const initials = username.slice(0, 2).toUpperCase() || 'WS';

  return (
    <aside
      className={clsx(
        'shrink-0 h-screen sticky top-0 flex flex-col justify-between overflow-y-auto select-none transition-all duration-200 z-40',
        collapsed ? 'w-[72px] px-3 py-6' : 'w-[224px] px-[18px] py-8',
        'bg-[#142C33] text-[#c2ced0] border-r border-[#203c44]'
      )}
      aria-label="Main navigation"
    >
      <div className="flex flex-col">
        {/* Brand */}
        <div
          className={clsx(
            'flex items-center gap-3 mb-9 text-white font-semibold text-[23px] tracking-[-0.6px]',
            collapsed ? 'justify-center px-0' : 'px-3'
          )}
        >
          <div className="w-[34px] h-[34px] rounded-[10px] bg-[#b6e6c9] text-[#14372e] flex items-center justify-center font-bold text-sm shrink-0">
            <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17V9m5 8V5m5 12v-6m5 6V3" />
            </svg>
          </div>
          {!collapsed && (
            <span>
              stockai<span className="text-[#a7d7bd]">.</span>
            </span>
          )}
        </div>

        {/* Section Label */}
        {!collapsed && (
          <div className="px-3 text-[11px] text-[#759097] tracking-[1.6px] font-semibold mb-3 uppercase">
            YOUR WORKSPACE
          </div>
        )}

        {/* Navigation list */}
        <nav className="space-y-1.5" role="navigation">
          {PRIMARY_NAV.map(({ href, aliases, icon: Icon, label, hasCount }) => {
            const isActive =
              href === '/dashboard'
                ? pathname === '/dashboard' || pathname === '/'
                : aliases.some((a) => pathname === a || pathname.startsWith(a + '/'));

            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3.5 py-3 rounded-[8px] text-sm transition-all',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-[#304b50] text-white font-medium shadow-[inset_3px_0_#b6e6c9]'
                    : 'text-[#b6c7ca] hover:bg-[#203c44] hover:text-white'
                )}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0 stroke-[1.8]" />
                {!collapsed && (
                  <>
                    <span className="truncate">{label}</span>
                    {hasCount && watchCount !== null && (
                      <span className="ml-auto text-xs text-[#c2d1d2] font-mono">
                        {watchCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Bottom: Companion Trigger & Profile */}
      <div className="mt-auto pt-6 space-y-4">
        {/* Research Companion Button */}
        <button
          onClick={() => openResearchCompanion()}
          className={clsx(
            'w-full border border-[#365059] hover:border-[#4d707c] hover:bg-[#203c44] rounded-[10px] py-3 text-sm text-[#e2edee] flex items-center transition-colors',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-3.5'
          )}
          title="Ask your research"
        >
          <Sparkles className="w-4 h-4 text-[#a7d7bd] shrink-0 stroke-[2]" />
          {!collapsed && <span>Ask your research</span>}
        </button>

        {/* Profile & Settings */}
        <div
          className={clsx(
            'border-t border-[#304951] pt-4 flex items-center',
            collapsed ? 'justify-center' : 'gap-2.5 px-2'
          )}
        >
          <span className="w-8 h-8 rounded-full bg-[#36525a] text-[#e2eaeb] flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#e2edee] truncate leading-tight">
                {username}
              </p>
              <p className="text-[11px] text-[#89a1a8] leading-tight">
                Personal workspace
              </p>
            </div>
          )}
          <Link
            href="/settings"
            className="text-[#adc0c5] hover:text-white p-1.5 rounded-md hover:bg-[#203c44]"
            aria-label="Settings"
            title="Workspace Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-1.5 text-xs text-[#759097] hover:text-[#e2edee] rounded transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
