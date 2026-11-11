/**
 * Real Market Bar Signal Resolution Engine.
 *
 * Rules:
 *   1. Resolve open signals using real daily high/low bars since issued_at.
 *   2. If both stop and target fall inside one bar, count it as SL_HIT (conservative).
 *   3. If a signal is issued after market close (15:30 IST) or on a weekend,
 *      use the next trading day's OPEN as the effective entry price.
 *   4. For SELL (short) signals:
 *      - Target hit when bar.low <= target_price
 *      - Stop hit when bar.high >= stop_loss_price
 *      - Realized PnL% = ((entry_price - closed_price) / entry_price) * 100
 *   5. If horizon_days is reached without target or stop hit, resolve as EXPIRED
 *      using the final bar's close.
 */

export type DailyBar = {
  date: string; // "YYYY-MM-DD"
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type SignalInput = {
  id?: string;
  symbol?: string;
  signal_type: 'BUY' | 'SELL' | string;
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  issued_at: Date | string;
  horizon_days: number;
  rule_version?: string;
  source?: string;
  as_of?: Date | string;
};

export type SignalResolution = {
  status: 'OPEN' | 'TARGET_HIT' | 'SL_HIT' | 'EXPIRED';
  closed_price: number | null;
  closed_at: Date | null;
  realized_pnl_pct: number | null;
  effective_entry_price: number;
  resolution_bar?: DailyBar | null;
  reason?: string;
};

/**
 * Helper to determine whether an issued_at timestamp fell after regular NSE trading hours
 * (regular hours: Mon-Fri 09:15-15:30 IST, UTC+5:30).
 */
export function isIssuedAfterMarketClose(issuedAt: Date): boolean {
  // Convert UTC date to IST (+5 hours 30 mins)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(issuedAt.getTime() + istOffsetMs);

  const dayOfWeek = istDate.getUTCDay(); // 0 = Sun, 6 = Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true; // Weekend
  }

  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 15:30 IST is 15 * 60 + 30 = 930 minutes
  return totalMinutes >= 930;
}

/**
 * Resolves an open signal against a chronological series of real daily OHLCV bars.
 */
export function resolveSignalWithBars(
  signal: SignalInput,
  bars: DailyBar[],
  currentDate: Date = new Date()
): SignalResolution {
  const issuedDate = new Date(signal.issued_at);
  const isAfterClose = isIssuedAfterMarketClose(issuedDate);

  // Compute expiry cutoff date (issued_at + horizon_days)
  const expiryDate = new Date(issuedDate.getTime());
  expiryDate.setDate(expiryDate.getDate() + signal.horizon_days);

  // Sort bars chronologically
  const sortedBars = [...bars].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Determine effective entry price:
  // If issued after market close, use next-day open for entry
  let effectiveEntry = signal.entry_price;
  let entryBarIndex = 0;

  // Format issued date in IST (YYYY-MM-DD)
  const issuedDateStr = new Date(issuedDate.getTime() + 5.5 * 3600 * 1000)
    .toISOString()
    .split('T')[0];

  if (isAfterClose) {
    // Find the first trading day strictly after the issued date
    const nextBarIdx = sortedBars.findIndex((b) => b.date > issuedDateStr);
    if (nextBarIdx !== -1) {
      entryBarIndex = nextBarIdx;
      effectiveEntry = sortedBars[nextBarIdx].open;
    } else {
      // Market has not yet opened for the next trading session
      return {
        status: 'OPEN',
        closed_price: null,
        closed_at: null,
        realized_pnl_pct: null,
        effective_entry_price: effectiveEntry,
        reason: 'Pending next-day market open for execution',
      };
    }
  } else {
    // Issued during market hours: start checking from the issued date bar
    const sameBarIdx = sortedBars.findIndex((b) => b.date >= issuedDateStr);
    if (sameBarIdx !== -1) {
      entryBarIndex = sameBarIdx;
    }
  }

  const isBuy = signal.signal_type.toUpperCase() === 'BUY';
  const isSell = signal.signal_type.toUpperCase() === 'SELL';

  // Evaluate daily bars starting from the entry bar
  for (let i = entryBarIndex; i < sortedBars.length; i++) {
    const bar = sortedBars[i];
    const barDate = new Date(bar.date + 'T15:30:00+05:30');

    // Check expiry: either bar date has reached/passed expiry cutoff, or on the final bar if currentDate >= expiryDate
    const isPastHorizon = barDate >= expiryDate || (i === sortedBars.length - 1 && currentDate >= expiryDate);

    if (isBuy) {
      const hitTarget = bar.high >= signal.target_price;
      const hitStop = bar.low <= signal.stop_loss_price;

      // Conservative rule: If BOTH stop and target fall inside one bar -> SL_HIT
      if (hitTarget && hitStop) {
        const pnl = ((signal.stop_loss_price - effectiveEntry) / effectiveEntry) * 100;
        return {
          status: 'SL_HIT',
          closed_price: signal.stop_loss_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
          reason: 'Both stop and target triggered in same bar; resolved conservatively to SL_HIT',
        };
      }

      if (hitStop) {
        const pnl = ((signal.stop_loss_price - effectiveEntry) / effectiveEntry) * 100;
        return {
          status: 'SL_HIT',
          closed_price: signal.stop_loss_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
        };
      }

      if (hitTarget) {
        const pnl = ((signal.target_price - effectiveEntry) / effectiveEntry) * 100;
        return {
          status: 'TARGET_HIT',
          closed_price: signal.target_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
        };
      }
    } else if (isSell) {
      // SELL / SHORT:
      // Target is below entry (bar.low <= target_price)
      // Stop loss is above entry (bar.high >= stop_loss_price)
      const hitTarget = bar.low <= signal.target_price;
      const hitStop = bar.high >= signal.stop_loss_price;

      // Conservative rule: If BOTH stop and target fall inside one bar -> SL_HIT
      if (hitTarget && hitStop) {
        // Short loss: (entry - stop) / entry
        const pnl = ((effectiveEntry - signal.stop_loss_price) / effectiveEntry) * 100;
        return {
          status: 'SL_HIT',
          closed_price: signal.stop_loss_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
          reason: 'Both stop and target triggered in same bar; resolved conservatively to SL_HIT',
        };
      }

      if (hitStop) {
        const pnl = ((effectiveEntry - signal.stop_loss_price) / effectiveEntry) * 100;
        return {
          status: 'SL_HIT',
          closed_price: signal.stop_loss_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
        };
      }

      if (hitTarget) {
        const pnl = ((effectiveEntry - signal.target_price) / effectiveEntry) * 100;
        return {
          status: 'TARGET_HIT',
          closed_price: signal.target_price,
          closed_at: barDate,
          realized_pnl_pct: round2(pnl),
          effective_entry_price: effectiveEntry,
          resolution_bar: bar,
        };
      }
    }

    // Expiry check if horizon exceeded on this bar
    if (isPastHorizon) {
      const pnl = isBuy
        ? ((bar.close - effectiveEntry) / effectiveEntry) * 100
        : ((effectiveEntry - bar.close) / effectiveEntry) * 100;
      return {
        status: 'EXPIRED',
        closed_price: bar.close,
        closed_at: barDate,
        realized_pnl_pct: round2(pnl),
        effective_entry_price: effectiveEntry,
        resolution_bar: bar,
        reason: `Holding period exceeded ${signal.horizon_days} days without target or stop hit`,
      };
    }
  }

  // Still active
  return {
    status: 'OPEN',
    closed_price: null,
    closed_at: null,
    realized_pnl_pct: null,
    effective_entry_price: effectiveEntry,
  };
}

/**
 * Backward compatibility wrapper for single-tick evaluation.
 */
export function evaluateSignal(
  signal: SignalInput,
  current_price: number,
  current_date: Date
): SignalResolution {
  // Synthesize a single daily bar with current_price
  const dateStr = current_date.toISOString().split('T')[0];
  const bar: DailyBar = {
    date: dateStr,
    open: current_price,
    high: current_price,
    low: current_price,
    close: current_price,
  };
  return resolveSignalWithBars(signal, [bar], current_date);
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}
