'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { clsx } from 'clsx';

export interface ChartDataPoint {
  time: string;
  value: number;
  benchmark?: number;
}

export interface FinancialChartProps {
  data: ChartDataPoint[];
  title?: string;
  subtitle?: string;
  height?: number;
  isPositive?: boolean;
  showTimeRange?: boolean;
  onRangeChange?: (range: string) => void;
  className?: string;
}

const TIME_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'];

export const FinancialChart: React.FC<FinancialChartProps> = ({
  data,
  title,
  subtitle,
  height = 320,
  isPositive = true,
  showTimeRange = true,
  onRangeChange,
  className = '',
}) => {
  const [selectedRange, setSelectedRange] = useState('1M');

  const handleRangeClick = (range: string) => {
    setSelectedRange(range);
    if (onRangeChange) onRangeChange(range);
  };

  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const fillColor = isPositive ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)';

  return (
    <div className={clsx('w-full flex flex-col', className)}>
      {(title || showTimeRange) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div>
            {title && <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>

          {showTimeRange && (
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-btn border border-slate-200 dark:border-white/[0.06] self-start sm:self-auto">
              {TIME_RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => handleRangeClick(range)}
                  className={clsx(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150',
                    selectedRange === range
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-subtle'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ height: `${height}px` }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.12} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800/60"
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748B' }}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#64748B' }}
              domain={['auto', 'auto']}
              tickFormatter={(val) => `₹${val.toLocaleString()}`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white dark:bg-slate-800 border border-slate-700/60 px-3 py-2 rounded-lg shadow-elevation text-xs">
                      <div className="text-slate-400 mb-1 font-medium">{item.time}</div>
                      <div className="text-sm font-semibold">
                        ₹{item.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              fill="url(#chartGradient)"
              activeDot={{ r: 4, stroke: strokeColor, strokeWidth: 2, fill: '#FFFFFF' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
