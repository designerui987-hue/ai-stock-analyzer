'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { ResearchCompanionDrawer } from '@/components/layout/ResearchCompanionDrawer';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  useEffect(() => {
    // Enforce StockAI visual canvas
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
      document.body.style.background = '#F5F7F7';
      document.body.style.color = '#142B32';
    }
  }, []);

  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (isAuthPage) {
    return <div className="bg-[#F5F7F7] min-h-screen text-[#142B32]">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7F7] text-[#142B32] antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Visible DEMO DATA banner when DEMO_MODE=true per AGENTS.md rule 1 */}
        {isDemoMode && (
          <div className="bg-[#faf0dc] text-[#8f6a24] font-semibold px-4 py-1.5 text-xs tracking-wider uppercase flex items-center justify-center gap-2 border-b border-[#eddab1] shrink-0">
            <span className="bg-[#8f6a24] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">DEMO DATA</span>
            <span>DEMO_MODE=true: Displaying static fallback fixtures for demonstration purposes only.</span>
          </div>
        )}

        <Header onMenuClick={() => setMobileNavOpen(true)} />

        <main className="flex-1 overflow-y-auto bg-[#F5F7F7]">
          <div className="max-w-[1580px] mx-auto p-6 md:p-9 space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer Navigation */}
      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Contextual Research Assistant Drawer */}
      <ResearchCompanionDrawer />
    </div>
  );
}
