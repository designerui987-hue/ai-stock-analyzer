'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'standard' | 'large';
  interactive?: boolean;
  noPadding?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      className,
      size = 'standard',
      interactive = false,
      noPadding = false,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.06] transition-all duration-200 ease-out';

    const radiusStyles = {
      standard: 'rounded-card',
      large: 'rounded-card-lg',
    };

    const paddingStyles = noPadding ? '' : 'p-6';

    const interactiveStyles = interactive
      ? 'hover:-translate-y-[2px] hover:border-slate-300 dark:hover:border-white/[0.12] hover:shadow-subtle dark:hover:shadow-dark-subtle cursor-pointer'
      : '';

    return (
      <div
        ref={ref}
        className={clsx(
          baseStyles,
          radiusStyles[size],
          paddingStyles,
          interactiveStyles,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
