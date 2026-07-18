'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth } from '@/lib/api';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = () => {
      const authenticated = auth.isAuthenticated();
      setIsAuthenticated(authenticated);
      setIsLoading(false);

      // Public routes that don't require authentication
      const publicRoutes = ['/login', '/register'];

      if (!authenticated && !publicRoutes.includes(pathname)) {
        router.push('/login');
      } else if (authenticated && (pathname === '/login' || pathname === '/register')) {
        router.push('/dashboard');
      }
    };

    checkAuth();
  }, [pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // For public routes (login/register), render without navigation
  if (pathname === '/login' || pathname === '/register') {
    return <>{children}</>;
  }

  // For authenticated routes, render with navigation
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // This shouldn't be reached, but just in case
  return null;
}