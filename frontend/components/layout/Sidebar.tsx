'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  PieChart,
  Bookmark,
  Grid,
  Sparkles,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { href: '/stocks/RELIANCE', icon: TrendingUp, label: 'Stock Analysis' },
  { href: '/watchlist', icon: Bookmark, label: 'Watchlist' },
  { href: '/assistant', icon: Bot, label: 'AI Assistant' },
  { href: '/insights', icon: Sparkles, label: 'AI Insights' },
  { href: '/heatmap', icon: Grid, label: 'Market Heatmap' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const path = usePathname();

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="shrink-0 h-screen sticky top-0 flex flex-col justify-between overflow-hidden z-40 bg-white dark:bg-[#101827] border-r border-slate-200 dark:border-white/[0.06] select-none"
    >
      <div>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 shrink-0 border-b border-slate-100 dark:border-white/[0.04]">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-subtle">
            <TrendingUp className="w-4 h-4 stroke-[2]" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                className="min-w-0"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                  StockAI
                </p>
                <p className="text-caption text-slate-500 dark:text-slate-400">
                  Institutional Intelligence
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation items */}
        <nav className="p-3 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active =
              href === '/dashboard'
                ? path === '/dashboard'
                : path.startsWith(href.replace('/RELIANCE', ''));
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-all duration-150 relative group',
                  active
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <Icon
                  className={clsx(
                    'w-4 h-4 shrink-0 transition-colors stroke-[1.75]',
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  )}
                />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-indigo-600 dark:bg-indigo-400" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / System Status */}
      <div className="p-3 space-y-2 border-t border-slate-100 dark:border-white/[0.04]">
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-card bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/[0.04]"
            >
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-caption font-medium text-emerald-600 dark:text-emerald-400">
                  Engine Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Multi-model ensemble connected
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-btn text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
