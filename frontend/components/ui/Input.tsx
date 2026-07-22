'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, suffix, error, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3.5 text-slate-400 dark:text-slate-500 pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={clsx(
              'w-full bg-slate-50 dark:bg-slate-900/60 border text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-input text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed',
              icon ? 'pl-10' : 'pl-3.5',
              suffix ? 'pr-10' : 'pr-3.5',
              error
                ? 'border-red-500 focus:ring-red-500/30 focus:border-red-500'
                : 'border-slate-200 dark:border-white/[0.08]',
              'h-10',
              className
            )}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3.5 text-slate-400 dark:text-slate-500 flex items-center justify-center">
              {suffix}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
