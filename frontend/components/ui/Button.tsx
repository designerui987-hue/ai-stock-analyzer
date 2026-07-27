'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      isLoading = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-btn transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:transform-none select-none';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 h-8',
      md: 'px-4 py-2 text-sm gap-2 h-10',
      lg: 'px-5 py-2.5 text-base gap-2.5 h-12',
    };

    const variantStyles = {
      primary:
        'bg-indigo-600 hover:bg-indigo-700 text-white shadow-subtle dark:shadow-dark-subtle',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-slate-200 dark:border-white/5',
      outline:
        'bg-transparent hover:bg-slate-100 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-white/10',
      ghost:
        'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100',
      danger:
        'bg-red-600 hover:bg-red-700 text-white shadow-subtle dark:shadow-dark-subtle',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
        ) : (
          icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
        )}
        <span>{children}</span>
        {!isLoading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
