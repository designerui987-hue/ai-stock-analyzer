'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, icon, suffix, error, disabled, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="text-xs font-semibold text-[#142B32] block">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3.5 text-[#687A81] pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={clsx(
              'w-full bg-white border text-[#142B32] placeholder:text-[#687A81] rounded-[7px] text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/30 focus:border-[#087F73] disabled:opacity-50 disabled:cursor-not-allowed',
              icon ? 'pl-10' : 'pl-3.5',
              suffix ? 'pr-10' : 'pr-3.5',
              error
                ? 'border-[#BB4B48] focus:ring-[#BB4B48]/30 focus:border-[#BB4B48]'
                : 'border-[#E1E7E8] hover:border-[#CCD7D9]',
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
        {error ? (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-caption text-slate-500 dark:text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
