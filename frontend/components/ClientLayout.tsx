'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import { useAuth } from '@/store/useAuth';
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();

  // Check if current page is public (landing, login, register)
  const isPublicPage = pathname === '/' || pathname === '/login' || pathname === '/register';

  // If not logged in on public pages, render without sidebar
  if (!isLoggedIn && isPublicPage) {
    return <>{children}</>;
  }

  // Default: show sidebar layout for logged in users
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5" style={{ background: '#080b10' }}>
          {children}
        </main>
      </div>
      
      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
