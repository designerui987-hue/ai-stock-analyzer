'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'red' | 'amber' | 'indigo' | 'neutral' | 'buy' | 'sell' | 'hold';
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
    'inline-flex items-center font-medium rounded-full tracking-wide transition-colors select-none';

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[11px] leading-tight gap-1',
    md: 'px-2.5 py-1 text-xs leading-tight gap-1.5',
  };

  const variantStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
    neutral: 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5',
    buy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    sell: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
    hold: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
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
