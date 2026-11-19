'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'red' | 'amber' | 'indigo' | 'neutral' | 'slate' | 'buy' | 'sell' | 'hold' | 'caution';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'neutral',
  size = 'md',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center font-semibold rounded-[4px] tracking-normal transition-colors select-none';

  const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-[11px] leading-tight gap-1',
    md: 'px-2 py-0.5 text-xs leading-tight gap-1.5',
  };

  const variantStyles = {
    emerald: 'bg-[#edf5ef] text-[#52775c] border border-[#d3e5d7]',
    buy: 'bg-[#edf5ef] text-[#52775c] border border-[#d3e5d7]',
    red: 'bg-[#fcedec] text-[#bb4b48] border border-[#f5d3d2]',
    sell: 'bg-[#fcedec] text-[#bb4b48] border border-[#f5d3d2]',
    amber: 'bg-[#faf0dc] text-[#8f6a24] border border-[#eddab1]',
    hold: 'bg-[#faf0dc] text-[#8f6a24] border border-[#eddab1]',
    caution: 'bg-[#faf0dc] text-[#8f6a24] border border-[#eddab1]',
    indigo: 'bg-[#e3f2ed] text-[#087f73] border border-[#c5e4db]',
    neutral: 'bg-[#eef2f2] text-[#5c6e74] border border-[#e1e7e8]',
    slate: 'bg-[#eef2f2] text-[#5c6e74] border border-[#e1e7e8]',
  };

  return (
    <span
      className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
};
