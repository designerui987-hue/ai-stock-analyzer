'use client';

import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  useEffect(() => {
    // Ensure light mode is the default on initial load
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
      document.body.style.background = '#F8FAFC';
      document.body.style.color = '#111827';
    }
  }, []);

  const isAuthPage = pathname === '/login' || pathname === '/register';

  // Render auth pages (login/register) directly without sidebar layout if visited explicitly
  if (isAuthPage) {
    return <div className="bg-slate-50 dark:bg-[#0B0F17] min-h-screen text-slate-900 dark:text-slate-100">{children}</div>;
  }

  // Render full dashboard layout for all main platform pages
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Visible DEMO DATA banner when DEMO_MODE=true per AGENTS.md rule 1 */}
        {isDemoMode && (
          <div className="bg-amber-500 text-slate-950 font-bold px-4 py-1.5 text-xs tracking-wider uppercase flex items-center justify-center gap-2 border-b border-amber-600 shadow-sm shrink-0">
            <span className="bg-slate-900 text-amber-300 text-[10px] font-black px-1.5 py-0.5 rounded">DEMO DATA</span>
            <span>DEMO_MODE=true: Displaying static fallback fixtures for demonstration purposes only.</span>
          </div>
        )}
        <Header />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-slate-50 dark:bg-[#0B0F17]">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
