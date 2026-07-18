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
  Menu,
  X,
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

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  return (
    <>
      {/* Mobile Menu Button - only visible on small screens */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 flex items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Menu */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="md:hidden fixed inset-0 bg-black/50 z-40"
            />

            {/* Menu Panel */}
            <motion.nav
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="md:hidden fixed right-0 top-0 bottom-0 w-64 z-40 overflow-y-auto"
              style={{ background: '#0e1117', borderLeft: '1px solid rgba(255,255,255,0.055)' }}
            >
              {/* Mobile Logo */}
              <div className="flex items-center gap-3 px-4 py-5 flex-shrink-0 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.055)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-none">StockAI</p>
                  <p className="text-[10px] text-[#4a5668] mt-0.5">AI-Powered Analysis</p>
                </div>
              </div>

              {/* Mobile Nav Items */}
              <div className="px-2 space-y-0.5 py-4">
                {NAV.map(({ href, icon: Icon, label }) => {
                  const active = href === '/dashboard' ? path === '/dashboard' : path.startsWith(href.replace('/RELIANCE', ''));
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'bg-[#6366f1]/12 text-[#818cf8] border border-[#6366f1]/18'
                          : 'text-[#4a5668] hover:bg-white/5 hover:text-[#8b9cb5] border border-transparent'
                      }`}>
                      <Icon size={20} className="flex-shrink-0" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile Demo Info */}
              <div
                className="mx-2 mt-auto mb-4 p-3 rounded-xl"
                style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00d68f] animate-pulse" />
                  <span className="text-[10px] text-[#00d68f] font-semibold">Demo Mode · v1.0</span>
                </div>
                <p className="text-[10px] text-[#4a5668]">Add API keys in Settings for live data</p>
              </div>

              {/* Logout button — will be added with auth */}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}