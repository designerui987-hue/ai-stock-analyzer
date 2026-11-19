'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'teal' | 'link';
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
      'inline-flex items-center justify-center font-semibold rounded-[8px] transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:transform-none select-none';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 h-8',
      md: 'px-4 py-2 text-sm gap-2 h-10',
      lg: 'px-5 py-2.5 text-base gap-2.5 h-12',
    };

    const variantStyles = {
      primary:
        'bg-[#142B32] hover:bg-[#203c44] text-white border border-[#142B32] shadow-sm',
      teal:
        'bg-[#087F73] hover:bg-[#076f64] text-white border border-[#087F73] shadow-sm',
      secondary:
        'bg-white hover:bg-[#F0F5F3] text-[#142B32] border border-[#E1E7E8]',
      outline:
        'bg-transparent hover:bg-[#EEF2F2] text-[#142B32] border border-[#E1E7E8]',
      ghost:
        'bg-transparent hover:bg-[#EEF2F2] text-[#687A81] hover:text-[#142B32]',
      danger:
        'bg-[#BB4B48] hover:bg-[#a6403d] text-white shadow-sm',
      link:
        'bg-transparent text-[#087F73] hover:underline p-0 h-auto font-medium',
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
