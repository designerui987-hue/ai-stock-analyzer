/**
 * Shared NSE Session Evaluator, Quote Freshness Gate & Realistic Paper Execution Engine.
 */

export interface ServerQuotePayload {
  symbol?: string;
  exchange?: string;
  price?: number | null;
  status?: string;
  freshness?: string;
  source?: string;
  as_of?: string | null;
  exchange_timestamp?: string | null;
  reason?: string;
}

const NSE_HOLIDAYS = new Set<string>([
  '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14',
  '2025-04-18', '2025-05-01', '2025-08-15', '2025-08-27', '2025-10-02',
  '2025-10-21', '2025-10-22', '2025-11-05', '2025-12-25',
  '2026-01-15', '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31',
  '2026-04-03', '2026-04-14', '2026-05-01', '2026-05-28', '2026-06-26',
  '2026-09-14', '2026-10-02', '2026-10-20', '2026-11-08', '2026-11-10',
  '2026-11-24', '2026-12-25',
  '2027-01-26', '2027-03-26', '2027-04-14', '2027-05-01', '2027-08-15',
  '2027-10-02', '2027-12-25',
]);

const SPECIAL_SESSIONS: Record<string, { startMin: number; endMin: number; name: string }> = {
  '2025-02-01': { startMin: 9 * 60 + 15, endMin: 15 * 60 + 30, name: 'Budget Special' },
  '2025-10-21': { startMin: 13 * 60 + 45, endMin: 14 * 60 + 45, name: 'Muhurat Trading 2025' },
  '2026-02-01': { startMin: 9 * 60 + 15, endMin: 15 * 60 + 30, name: 'Budget Special 2026' },
  '2026-11-08': { startMin: 18 * 60, endMin: 19 * 60, name: 'Muhurat Trading 2026' },
};

export function evaluateNseSession(nowUtc: Date = new Date()): {
  open: boolean;
  session: 'REGULAR' | 'SPECIAL_SESSION' | 'PRE_OPEN' | 'POST_CLOSE' | 'HOLIDAY' | 'WEEKEND' | 'CLOSED';
  reason?: string;
} {
  // Format parts strictly in Asia/Kolkata
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(nowUtc).map((p) => [p.type, p.value]));
  const dateIso = `${parts.year}-${parts.month}-${parts.day}`;
  const mins = Number(parts.hour) * 60 + Number(parts.minute);

  const spec = SPECIAL_SESSIONS[dateIso];
  if (spec) {
    if (mins >= spec.startMin && mins < spec.endMin) {
      return { open: true, session: 'SPECIAL_SESSION' };
    }
    return { open: false, session: 'CLOSED', reason: `Outside ${spec.name} session hours.` };
  }

  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
    return { open: false, session: 'WEEKEND', reason: 'NSE closed on weekends.' };
  }
  if (NSE_HOLIDAYS.has(dateIso)) {
    return { open: false, session: 'HOLIDAY', reason: `NSE holiday (${dateIso}).` };
  }

  if (mins >= 9 * 60 && mins < 9 * 60 + 15) {
    return { open: false, session: 'PRE_OPEN', reason: 'NSE pre-open call auction window.' };
  }
  if (mins >= 9 * 60 + 15 && mins < 15 * 60 + 30) {
    return { open: true, session: 'REGULAR' };
  }
  if (mins >= 15 * 60 + 30 && mins < 16 * 60) {
    return { open: false, session: 'POST_CLOSE', reason: 'NSE post-close session.' };
  }
  return { open: false, session: 'CLOSED', reason: 'Outside NSE continuous trading hours (09:15-15:30 IST).' };
}

export function validateQuoteForOrder(
  quote: ServerQuotePayload | null,
  opts: {
    expectedSymbol: string;
    expectedExchange: string;
    maxAgeSeconds: number;
    nowUtc?: Date;
  }
): {
  valid: boolean;
  price?: number;
  source?: string;
  asOf?: string;
  ageSeconds?: number;
  reason?: string;
} {
  if (!quote) {
    return { valid: false, reason: `Market quote for ${opts.expectedSymbol} unavailable.` };
  }
  if (quote.status === 'unavailable' || quote.freshness === 'UNAVAILABLE') {
    return {
      valid: false,
      reason: quote.reason || `Market quote for ${opts.expectedSymbol} is unavailable.`,
    };
  }
  if (typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) {
    return { valid: false, reason: `Invalid or non-positive quote price for ${opts.expectedSymbol}.` };
  }
  if (!quote.source || quote.source === 'unavailable') {
    return { valid: false, reason: 'Quote source missing or unverified.' };
  }
  if (quote.exchange && quote.exchange.toUpperCase() !== opts.expectedExchange.toUpperCase()) {
    return {
      valid: false,
      reason: `Exchange mismatch: expected ${opts.expectedExchange}, got ${quote.exchange}.`,
    };
  }

  const obsTimeStr = quote.exchange_timestamp || quote.as_of;
  if (!obsTimeStr) {
    return { valid: false, reason: 'Quote missing exchange observation timestamp (`as_of`).' };
  }
  const obsMs = Date.parse(obsTimeStr);
  if (Number.isNaN(obsMs)) {
    return { valid: false, reason: `Unparseable quote timestamp: ${obsTimeStr}` };
  }

  const nowMs = (opts.nowUtc || new Date()).getTime();
  const ageSeconds = Math.max(0, (nowMs - obsMs) / 1000);
  if (ageSeconds > opts.maxAgeSeconds) {
    return {
      valid: false,
      ageSeconds,
      reason: `Quote timestamp is stale (${Math.round(ageSeconds)}s old > max ${opts.maxAgeSeconds}s).`,
    };
  }

  return {
    valid: true,
    price: quote.price,
    source: quote.source,
    asOf: obsTimeStr,
    ageSeconds,
  };
}

export function calculateIndianEquityFees(
  notional: number,
  transactionType: 'BUY' | 'SELL',
  productType: 'CNC' | 'MIS' | 'NRML'
): {
  brokerage: number;
  stt: number;
  exchange_txn: number;
  sebi: number;
  stamp_duty: number;
  gst: number;
  total_fees: number;
} {
  const brokerage = Number(Math.min(20, notional * 0.0003).toFixed(2));
  const sttRate = productType === 'CNC' ? 0.001 : transactionType === 'SELL' ? 0.00025 : 0;
  const stt = Number((notional * sttRate).toFixed(2));
  const exchangeTxn = Number((notional * 0.0000325).toFixed(2));
  const sebi = Number((notional * 0.000001).toFixed(2));
  const stampRate = transactionType === 'BUY' ? (productType === 'CNC' ? 0.00015 : 0.00003) : 0;
  const stampDuty = Number((notional * stampRate).toFixed(2));
  const gst = Number(((brokerage + exchangeTxn) * 0.18).toFixed(2));
  const totalFees = Number((brokerage + stt + exchangeTxn + sebi + stampDuty + gst).toFixed(2));

  return {
    brokerage,
    stt,
    exchange_txn: exchangeTxn,
    sebi,
    stamp_duty: stampDuty,
    gst,
    total_fees: totalFees,
  };
}

export interface PaperExecutionResult {
  status: 'OPEN' | 'FILLED' | 'REJECTED';
  filled: boolean;
  execution_price: number | null;
  slippage_bps: number;
  fees_inr: number;
  fee_breakdown?: ReturnType<typeof calculateIndianEquityFees>;
  reason: string;
}

export function simulatePaperExecution(params: {
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
  product_type: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  quotePrice: number;
  limitPrice?: number;
  triggerPrice?: number;
  marketOpen: boolean;
  marketSession: string;
  slippageBps?: number;
}): PaperExecutionResult {
  const slippageBps = params.slippageBps ?? 5; // 5 bps modeled market impact
  const slipFrac = slippageBps / 10000;

  if (!params.marketOpen) {
    return {
      status: 'OPEN',
      filled: false,
      execution_price: null,
      slippage_bps: 0,
      fees_inr: 0,
      reason: `Paper order accepted as OPEN (queued): NSE session is ${params.marketSession}.`,
    };
  }

  if (params.order_type === 'MARKET') {
    const rawFill =
      params.transaction_type === 'BUY'
        ? params.quotePrice * (1 + slipFrac)
        : params.quotePrice * (1 - slipFrac);
    const fillPrice = Number(rawFill.toFixed(2));
    const fees = calculateIndianEquityFees(
      fillPrice * params.quantity,
      params.transaction_type,
      params.product_type
    );
    return {
      status: 'FILLED',
      filled: true,
      execution_price: fillPrice,
      slippage_bps: slippageBps,
      fees_inr: fees.total_fees,
      fee_breakdown: fees,
      reason: `Paper MARKET ${params.transaction_type} filled at ₹${fillPrice} (incl. ${slippageBps}bps modeled slippage).`,
    };
  }

  if (params.order_type === 'LIMIT') {
    if (!params.limitPrice || params.limitPrice <= 0) {
      return {
        status: 'REJECTED',
        filled: false,
        execution_price: null,
        slippage_bps: 0,
        fees_inr: 0,
        reason: 'LIMIT order requires a positive limit price.',
      };
    }

    const canFillBuy = params.transaction_type === 'BUY' && params.quotePrice <= params.limitPrice;
    const canFillSell = params.transaction_type === 'SELL' && params.quotePrice >= params.limitPrice;

    if (!canFillBuy && !canFillSell) {
      return {
        status: 'OPEN',
        filled: false,
        execution_price: null,
        slippage_bps: 0,
        fees_inr: 0,
        reason:
          params.transaction_type === 'BUY'
            ? `Resting PAPER BUY LIMIT at ₹${params.limitPrice.toFixed(2)} (LTP ₹${params.quotePrice.toFixed(2)} > limit).`
            : `Resting PAPER SELL LIMIT at ₹${params.limitPrice.toFixed(2)} (LTP ₹${params.quotePrice.toFixed(2)} < limit).`,
      };
    }

    const slipped =
      params.transaction_type === 'BUY'
        ? Math.min(params.limitPrice, params.quotePrice * (1 + slipFrac))
        : Math.max(params.limitPrice, params.quotePrice * (1 - slipFrac));
    const fillPrice = Number(slipped.toFixed(2));
    const fees = calculateIndianEquityFees(
      fillPrice * params.quantity,
      params.transaction_type,
      params.product_type
    );
    return {
      status: 'FILLED',
      filled: true,
      execution_price: fillPrice,
      slippage_bps: slippageBps,
      fees_inr: fees.total_fees,
      fee_breakdown: fees,
      reason: `Paper LIMIT ${params.transaction_type} filled at ₹${fillPrice} within limit ₹${params.limitPrice.toFixed(2)}.`,
    };
  }

  // SL / SL_M orders rest open until trigger price condition is hit
  if (!params.triggerPrice || params.triggerPrice <= 0) {
    return {
      status: 'REJECTED',
      filled: false,
      execution_price: null,
      slippage_bps: 0,
      fees_inr: 0,
      reason: `${params.order_type} order requires a positive trigger price.`,
    };
  }

  return {
    status: 'OPEN',
    filled: false,
    execution_price: null,
    slippage_bps: 0,
    fees_inr: 0,
    reason: `Paper ${params.order_type} accepted as OPEN awaiting trigger ₹${params.triggerPrice.toFixed(2)}.`,
  };
}

