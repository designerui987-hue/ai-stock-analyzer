'use client';

import React from 'react';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  isPositive?: boolean;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 96,
  height = 28,
  isPositive,
  className = '',
}) => {
  if (!data || data.length < 2) {
    return <div className={`w-[${width}px] h-[${height}px] bg-slate-100 dark:bg-slate-800 rounded`} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const positive = isPositive !== undefined ? isPositive : data[data.length - 1] >= data[0];
  const strokeColor = positive ? '#10B981' : '#EF4444';

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
