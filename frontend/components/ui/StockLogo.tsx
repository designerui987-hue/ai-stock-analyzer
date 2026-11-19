'use client';

import React from 'react';
import { getStockColorClass } from '@/lib/format';
import { clsx } from 'clsx';

interface StockLogoProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StockLogo: React.FC<StockLogoProps> = ({ symbol, size = 'md', className }) => {
  const { logoCls } = getStockColorClass(symbol);
  const letter = symbol ? symbol.charAt(0).toUpperCase() : '?';

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs rounded-lg',
    md: 'w-9 h-9 text-xs rounded-[10px]',
    lg: 'w-12 h-12 text-base rounded-xl',
  };

  return (
    <span
      className={clsx('stock-logo', logoCls, sizeClasses[size], className)}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
};
