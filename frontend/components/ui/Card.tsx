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
      'bg-white border border-[#E1E7E8] transition-all duration-200 ease-out';

    const radiusStyles = {
      standard: 'rounded-[14px]',
      large: 'rounded-[16px]',
    };

    const paddingStyles = noPadding ? '' : 'p-6';

    const interactiveStyles = interactive
      ? 'hover:-translate-y-[1px] hover:border-[#CCD7D9] hover:shadow-sm cursor-pointer'
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
