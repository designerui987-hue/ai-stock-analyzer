// @ts-nocheck
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  Eye,
  Zap,
  Brain,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/stocks/RELIANCE', icon: TrendingUp, label: 'Stock Analysis' },
  { href: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { href: '/watchlist', icon: Eye, label: 'Watchlist' },
  { href: '/heatmap', icon: Zap, label: 'Market Heatmap' },
  { href: '/insights', icon: Brain, label: 'AI Insights' },
  { href: '/assistant', icon: MessageSquare, label: 'AI Assistant' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const path = usePathname();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex-shrink-0 h-screen sticky top-0 flex flex-col overflow-hidden z-40"
      style={{ background: '#0e1117', borderRight: '1px solid rgba(255,255,255,0.055)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>
          <TrendingUp size={20} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
              <p className="text-sm font-bold text-white leading-none">StockAI</p>
              <p className="text-[10px] text-[#4a5668] mt-0.5">AI-Powered Analysis</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/dashboard' ? path === '/dashboard' : path.startsWith(href.replace('/RELIANCE', ''));
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-[#6366f1]/12 text-[#818cf8] border border-[#6366f1]/18'
                  : 'text-[#4a5668] hover:bg-white/5 hover:text-[#8b9cb5] border border-transparent'
              }`}>
              <Icon size={20} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }} className="truncate">
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#6366f1] flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: version + collapse */}
      <div className="flex-shrink-0 px-2 pb-4 space-y-2">
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mx-1 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d68f] animate-pulse" />
                <span className="text-[10px] text-[#00d68f] font-semibold">Demo Mode · v1.0</span>
              </div>
              <p className="text-[10px] text-[#4a5668]">Add API keys in Settings for live data</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] text-[#4a5668] hover:text-[#8b9cb5] hover:bg-white/5 transition-all">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <AnimatePresence>
            {!collapsed && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Collapse</motion.span>}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
