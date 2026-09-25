export type SignalResolution = {
  status: 'OPEN' | 'TARGET_HIT' | 'SL_HIT' | 'EXPIRED';
  realized_pnl_pct: number | null;
  closed_price: number | null;
  closed_at: Date | null;
};

export type SignalInput = {
  signal_type: string; // 'BUY' | 'SELL'
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  issued_at: Date;
  horizon_days: number;
};

export function evaluateSignal(signal: SignalInput, current_price: number, current_date: Date): SignalResolution {
  const { signal_type, entry_price, target_price, stop_loss_price, issued_at, horizon_days } = signal;
  
  let status: SignalResolution['status'] = 'OPEN';
  let closed_price: number | null = null;
  let realized_pnl_pct: number | null = null;
  let closed_at: Date | null = null;

  // Check if TARGET_HIT or SL_HIT based on type
  if (signal_type === 'BUY') {
    if (current_price >= target_price) {
      status = 'TARGET_HIT';
    } else if (current_price <= stop_loss_price) {
      status = 'SL_HIT';
    }
  } else if (signal_type === 'SELL') {
    if (current_price <= target_price) {
      status = 'TARGET_HIT';
    } else if (current_price >= stop_loss_price) {
      status = 'SL_HIT';
    }
  }

  // Check for EXPIRED if still OPEN
  if (status === 'OPEN') {
    // Add horizon_days to issued_at
    const expiryDate = new Date(issued_at.getTime());
    expiryDate.setDate(expiryDate.getDate() + horizon_days);
    
    // Set to end of day for expiry check (or just straight comparison)
    if (current_date > expiryDate) {
      status = 'EXPIRED';
    }
  }

  // If it's no longer OPEN, compute closed stats
  if (status !== 'OPEN') {
    closed_price = current_price;
    closed_at = current_date;
    
    // Compute PNL
    if (signal_type === 'BUY') {
      realized_pnl_pct = ((closed_price - entry_price) / entry_price) * 100;
    } else if (signal_type === 'SELL') {
      realized_pnl_pct = ((entry_price - closed_price) / entry_price) * 100;
    }
  }

  return {
    status,
    realized_pnl_pct,
    closed_price,
    closed_at,
  };
}
