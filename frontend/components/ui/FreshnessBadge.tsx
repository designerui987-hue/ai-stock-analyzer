'use client';

import React from 'react';

export type FreshnessStatus = 'LIVE' | 'DELAYED (15m)' | 'DELAYED' | 'STALE' | 'UNAVAILABLE';

interface FreshnessBadgeProps {
  status?: FreshnessStatus | string;
  asOf?: string | null;
  source?: string | null;
  className?: string;
  showDetails?: boolean;
}

export function FreshnessBadge({
  status = 'DELAYED (15m)',
  asOf,
  source = 'yfinance',
  className = '',
  showDetails = false,
}: FreshnessBadgeProps) {
  const normStatus = (status || 'DELAYED (15m)').toUpperCase();

  const getBadgeConfig = () => {
    switch (normStatus) {
      case 'LIVE':
        return {
          label: 'LIVE',
          wrapperClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: (
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ),
        };
      case 'DELAYED (15M)':
      case 'DELAYED':
        return {
          label: 'DELAYED (15m)',
          wrapperClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dot: <span className="inline-flex rounded-full h-2 w-2 bg-amber-400 mr-1.5" />,
        };
      case 'STALE':
        return {
          label: 'STALE',
          wrapperClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
          dot: <span className="inline-flex rounded-full h-2 w-2 bg-orange-400 mr-1.5" />,
        };
      case 'UNAVAILABLE':
      default:
        return {
          label: 'UNAVAILABLE',
          wrapperClass: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          dot: <span className="inline-flex rounded-full h-2 w-2 bg-slate-400 mr-1.5" />,
        };
    }
  };

  const config = getBadgeConfig();

  // Format as_of nicely if available
  const formattedTime = asOf
    ? (() => {
        try {
          return new Date(asOf).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Kolkata',
          }) + ' IST';
        } catch {
          return asOf;
        }
      })()
    : null;

  return (
    <div className={`inline-flex items-center ${className}`}>
      <span
        title={
          formattedTime
            ? `Source: ${source || 'exchange'} • As of: ${formattedTime}`
            : `Source: ${source || 'exchange'}`
        }
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border tracking-wide uppercase ${config.wrapperClass}`}
      >
        {config.dot}
        {config.label}
      </span>
      {showDetails && (
        <span className="text-[11px] text-slate-400 ml-2">
          {source && <span className="capitalize">{source}</span>}
          {formattedTime && <span> • {formattedTime}</span>}
        </span>
      )}
    </div>
  );
}

export default FreshnessBadge;

