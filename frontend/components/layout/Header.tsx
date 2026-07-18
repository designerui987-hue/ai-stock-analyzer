// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, LogOut, Search } from 'lucide-react';
import { DEMO_STOCKS } from '@/lib/data';

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/dashboard':  { title: 'Dashboard', sub: 'AI-Powered Market Overview' },
  '/portfolio':  { title: 'Portfolio', sub: 'Track your investments' },
  '/watchlist':  { title: 'Watchlist', sub: 'Stocks you\'re watching' },
  '/heatmap':    { title: 'Market Heatmap', sub: 'Sector performance at a glance' },
  '/insights':   { title: 'AI Insights', sub: 'AI-generated market signals' },
  '/assistant':  { title: 'AI Assistant', sub: 'Ask anything about the market' },
  '/settings':   { title: 'Settings', sub: 'Preferences & API keys' },
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isStock = pathname.startsWith('/stocks/');
  const sym = isStock ? pathname.split('/')[2]?.toUpperCase() : null;
  const stock = sym ? DEMO_STOCKS.find(s => s.symbol === sym) : null;
  const meta = PAGE_TITLES[pathname] || (isStock && stock ? { title: stock.symbol, sub: `${stock.name} · ${stock.sector}` } : { title: 'StockAI', sub: '' });

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const q = query.toLowerCase();
    const found = DEMO_STOCKS.filter(s =>
      s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 6);
    setResults(found);
    setOpen(found.length > 0);
  }, [query]);

  const selectStock = (symbol: string) => {
    router.push(`/stocks/${symbol}`);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const marketOpen = new Date().getHours() >= 9 && new Date().getHours() < 16;

  return (
    <header className="h-14 flex items-center px-5 gap-4 flex-shrink-0 sticky top-0 z-30"
      style={{ background: 'rgba(8,11,16,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>

      {/* Page title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-white leading-none truncate">{meta.title}</h1>
          <p className="text-[10px] text-[#4a5668] mt-0.5 truncate">{meta.sub}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
          marketOpen ? 'text-[#00d68f] bg-[#00d68f]/10 border-[#00d68f]/20' : 'text-[#4a5668] bg-white/5 border-white/8'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${marketOpen ? 'bg-[#00d68f] animate-pulse' : 'bg-[#4a5668]'}`} />
          {marketOpen ? 'Market Open' : 'Market Closed'}
        </div>
      </div>

      {/* Search */}
      <div className="relative w-64 flex-shrink-0">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
          focused ? 'border border-[#6366f1]/50 bg-[#131820]' : 'border border-[rgba(255,255,255,0.07)] bg-[#0e1117]'
        }`}>
          <Search size={16} className="text-[#4a5668] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setTimeout(() => { setFocused(false); setOpen(false); }, 150); }}
            placeholder="Search stocks…"
            className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-[#4a5668] focus:outline-none"
          />
          <kbd className="text-[9px] text-[#4a5668] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5 flex-shrink-0">⌘K</kbd>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full mt-2 left-0 right-0 z-50 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#131820', border: '1px solid rgba(255,255,255,0.08)' }}>
              {results.map(s => {
                const up = s.change_pct >= 0;
                return (
                  <button key={s.symbol} onClick={() => selectStock(s.symbol)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{s.symbol}</p>
                      <p className="text-[10px] text-[#4a5668] truncate">{s.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-white">₹{s.price.toLocaleString()}</p>
                      <p className={`text-[10px] font-semibold ${up ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
                        {up ? '+' : ''}{s.change_pct.toFixed(2)}%
                      </p>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: Notifications + Avatar + Logout */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button className="relative w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all text-[#4a5668] hover:text-white"
          title="Notifications">
          <Bell size={20} />
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center bg-[#ff4d6a] text-white">3</span>
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
          title="User Profile"
        >
          U
        </div>
        {/* Logout button — will be added with auth */}
      </div>
    </header>
  );
}
