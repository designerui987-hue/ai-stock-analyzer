'use client';

import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { useAuth } from '@/store/useAuth';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    // Enable dark mode by default on root HTML
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const isPublicPage = pathname === '/' || pathname === '/login' || pathname === '/register';

  if (!isLoggedIn && isPublicPage) {
    return <div className="bg-slate-50 dark:bg-[#0B0F17] min-h-screen">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
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
