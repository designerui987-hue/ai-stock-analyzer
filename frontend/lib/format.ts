/**
 * Formatting utilities for Indian stock market data and currency.
 */

export function formatINR(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return (
    '₹' +
    new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(val)
  );
}

export function formatNumberIN(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatPercent(val: number | null | undefined, includeSign = true): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const prefix = includeSign && val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(2)}%`;
}

export function formatMarketCap(val: number | string | null | undefined): string {
  if (!val) return '—';
  if (typeof val === 'string' && (val.includes('Cr') || val.includes('L'))) return val;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || num <= 0) return '—';

  // 1 Crore = 10,000,000 (10^7)
  // 1 Lakh Crore = 10^12
  if (num >= 1e12) {
    return `${(num / 1e12).toFixed(2)}L Cr`;
  }
  if (num >= 1e7) {
    return `${(num / 1e7).toFixed(2)} Cr`;
  }
  if (num >= 1e5) {
    return `${(num / 1e5).toFixed(2)} Lakh`;
  }
  return formatINR(num, 0);
}

export function getStockColorClass(symbol: string): { bg: string; text: string; logoCls: string } {
  const s = symbol.toUpperCase();
  if (s.startsWith('R') || s.startsWith('B') || s.startsWith('TATA')) {
    return { bg: 'bg-[#f6f0e0]', text: 'text-[#987433]', logoCls: 'gold' };
  }
  if (s.startsWith('H') || s.startsWith('T') || s.startsWith('I') || s.startsWith('W')) {
    return { bg: 'bg-[#eaf0f8]', text: 'text-[#406282]', logoCls: 'blue' };
  }
  if (s.startsWith('M') || s.startsWith('A') || s.startsWith('K')) {
    return { bg: 'bg-[#f8ebeb]', text: 'text-[#b54e54]', logoCls: 'red' };
  }
  return { bg: 'bg-[#e7f2eb]', text: 'text-[#43795f]', logoCls: 'green' };
}
