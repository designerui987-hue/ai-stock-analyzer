'use client';

import React from 'react';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  // Always render children directly without login wall redirects
  return <>{children}</>;
}