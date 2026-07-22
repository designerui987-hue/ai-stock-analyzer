'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return (
    <div
      className={clsx(
        'animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/60',
        className
      )}
      {...props}
    />
  );
};
