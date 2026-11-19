'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Bookmark, Briefcase, Sparkles, Settings, X } from 'lucide-react';
import { openResearchCompanion } from '@/components/layout/ResearchCompanionDrawer';
import { clsx } from 'clsx';

const PRIMARY_NAV = [
  { href: '/dashboard', aliases: ['/', '/dashboard'], icon: Home, label: 'Today' },
  { href: '/stocks', aliases: ['/stocks', '/heatmap'], icon: Compass, label: 'Explore' },
  { href: '/watchlist', aliases: ['/watchlist'], icon: Bookmark, label: 'Watchlist' },
  { href: '/portfolio', aliases: ['/portfolio', '/orders', '/portfolio/risk'], icon: Briefcase, label: 'Portfolio' },
];

export default function MobileNav({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-[#0c232c]/60 z-50 md:hidden backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Sidebar Drawer */}
      <div className="fixed inset-y-0 left-0 w-64 bg-[#142C33] text-[#c2ced0] z-50 p-6 flex flex-col justify-between shadow-2xl md:hidden">
        <div>
          {/* Top Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5 text-white font-semibold text-xl">
              <div className="w-8 h-8 rounded-lg bg-[#b6e6c9] text-[#14372e] flex items-center justify-center font-bold text-xs">
                <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 17V9m5 8V5m5 12v-6m5 6V3" />
                </svg>
              </div>
              <span>
                stockai<span className="text-[#a7d7bd]">.</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#899DA3] hover:text-white rounded-md"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="text-[11px] text-[#759097] tracking-[1.6px] font-semibold mb-3 uppercase">
            YOUR WORKSPACE
          </div>

          <nav className="space-y-1.5">
            {PRIMARY_NAV.map(({ href, aliases, icon: Icon, label }) => {
              const isActive =
                href === '/dashboard'
                  ? pathname === '/dashboard' || pathname === '/'
                  : aliases.some((a) => pathname === a || pathname.startsWith(a + '/'));

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={clsx(
                    'flex items-center gap-3 px-3.5 py-3 rounded-[8px] text-sm transition-all',
                    isActive
                      ? 'bg-[#304b50] text-white font-medium shadow-[inset_3px_0_#b6e6c9]'
                      : 'text-[#b6c7ca] hover:bg-[#203c44] hover:text-white'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0 stroke-[1.8]" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-[#304951] space-y-3">
          <button
            onClick={() => {
              onClose();
              openResearchCompanion();
            }}
            className="w-full border border-[#365059] hover:bg-[#203c44] rounded-[10px] py-2.5 px-3 text-xs text-[#e2edee] flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#a7d7bd]" />
            <span>Ask your research</span>
          </button>

          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#adc0c5] hover:text-white rounded-[8px] hover:bg-[#203c44]"
          >
            <Settings className="w-4 h-4" />
            <span>Settings & Preferences</span>
          </Link>
        </div>
      </div>
    </>
  );
}
