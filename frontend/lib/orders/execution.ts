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
  last_trade_timestamp?: string | null;
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
    maxClockSkewSeconds?: number;
    orderPlacedAt?: Date | string;
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
  // Explicit symbol match
  const quoteSym = (quote.symbol || '').trim().toUpperCase();
  const expectedSym = opts.expectedSymbol.trim().toUpperCase();
  if (quoteSym && quoteSym !== expectedSym) {
    return {
      valid: false,
      reason: `Symbol mismatch: expected ${expectedSym}, got ${quoteSym}.`,
    };
  }

  // Explicit exchange required
  if (!quote.exchange) {
    return {
      valid: false,
      reason: `Quote missing exchange: expected ${opts.expectedExchange}.`,
    };
  }
  if (quote.exchange.toUpperCase() !== opts.expectedExchange.toUpperCase()) {
    return {
      valid: false,
      reason: `Exchange mismatch: expected ${opts.expectedExchange}, got ${quote.exchange}.`,
    };
  }

  const obsTimeStr = quote.last_trade_timestamp || quote.exchange_timestamp || quote.as_of;
  if (!obsTimeStr) {
    return { valid: false, reason: 'Quote missing exchange observation timestamp (`as_of`).' };
  }
  const obsMs = Date.parse(obsTimeStr);
  if (Number.isNaN(obsMs)) {
    return { valid: false, reason: `Unparseable quote timestamp: ${obsTimeStr}` };
  }

  const nowMs = (opts.nowUtc || new Date()).getTime();
  const maxClockSkewMs = (opts.maxClockSkewSeconds ?? 15) * 1000; // 15s clock skew tolerance

  // Reject future timestamps outside clock-skew tolerance
  const exchangeMs = quote.exchange_timestamp ? Date.parse(quote.exchange_timestamp) : obsMs;
  if (Number.isNaN(exchangeMs)) {
    return { valid: false, reason: 'Unparseable exchange timestamp.' };
  }
  const latestObservedMs = Math.max(obsMs, exchangeMs);
  if (latestObservedMs > nowMs + maxClockSkewMs) {
    const aheadSeconds = Math.round((latestObservedMs - nowMs) / 1000);
    return {
      valid: false,
      reason: `Future quote timestamp outside clock-skew tolerance (${aheadSeconds}s ahead > max ${opts.maxClockSkewSeconds ?? 15}s).`,
    };
  }

  // Reject quote if strictly older than when the order was placed
  if (opts.orderPlacedAt) {
    const orderPlacedMs = typeof opts.orderPlacedAt === 'string' ? Date.parse(opts.orderPlacedAt) : opts.orderPlacedAt.getTime();
    if (!Number.isNaN(orderPlacedMs) && obsMs < orderPlacedMs) {
      return {
        valid: false,
        reason: `Quote timestamp (${new Date(obsMs).toISOString()}) is older than order creation time (${new Date(orderPlacedMs).toISOString()}).`,
      };
    }
  }

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

export interface PaperLimitSatisfactionResult {
  satisfied: boolean;
  fillPrice?: number;
  fees?: number;
  feeBreakdown?: ReturnType<typeof calculateIndianEquityFees>;
  quoteAsOf?: string;
  quoteSource?: string;
  sessionName?: string;
  reason: string;
}

/**
 * Pure evaluator for paper limit orders.
 * Strictly verifies NSE trading session, quote freshness, exchange integrity,
 * and limit price satisfaction (BUY limit: fill <= limit; SELL limit: fill >= limit).
 */
export function checkPaperLimitSatisfaction(params: {
  order: {
    id?: string;
    symbol: string;
    exchange?: string;
    transaction_type: 'BUY' | 'SELL';
    quantity: number;
    order_type: string;
    product_type?: string;
    price: number | null; // Limit price
    placed_at?: Date | string;
  };
  quote: ServerQuotePayload | null;
  nowUtc?: Date;
  maxAgeSeconds?: number;
  maxClockSkewSeconds?: number;
}): PaperLimitSatisfactionResult {
  const now = params.nowUtc || new Date();
  const session = evaluateNseSession(now);

  if (!session.open) {
    return {
      satisfied: false,
      sessionName: session.session,
      reason: `Cannot fill paper limit order while NSE session is ${session.session}.`,
    };
  }

  const limitPrice = params.order.price;
  if (!limitPrice || limitPrice <= 0) {
    return {
      satisfied: false,
      reason: 'LIMIT order has invalid or non-positive limit price.',
    };
  }

  const quoteCheck = validateQuoteForOrder(params.quote, {
    expectedSymbol: params.order.symbol,
    expectedExchange: params.order.exchange || 'NSE',
    maxAgeSeconds: params.maxAgeSeconds ?? 60,
    maxClockSkewSeconds: params.maxClockSkewSeconds ?? 15,
    orderPlacedAt: params.order.placed_at,
    nowUtc: now,
  });

  if (!quoteCheck.valid || !quoteCheck.price) {
    return {
      satisfied: false,
      reason: quoteCheck.reason || `Quote for ${params.order.symbol} is unavailable or stale.`,
    };
  }

  const quotePrice = quoteCheck.price;
  const slipFrac = 5 / 10000; // 5 bps modeled impact

  if (params.order.transaction_type === 'BUY') {
    if (quotePrice > limitPrice) {
      return {
        satisfied: false,
        quoteAsOf: quoteCheck.asOf,
        quoteSource: quoteCheck.source,
        sessionName: session.session,
        reason: `BUY LIMIT resting OPEN: Quote price ₹${quotePrice.toFixed(2)} is above limit ₹${limitPrice.toFixed(2)}.`,
      };
    }
    // At a BUY limit, fill at the limit or lower
    const rawFill = quotePrice * (1 + slipFrac);
    const fillPrice = Number(Math.min(limitPrice, rawFill).toFixed(2));
    const fees = calculateIndianEquityFees(
      fillPrice * params.order.quantity,
      'BUY',
      (params.order.product_type as any) || 'CNC'
    );
    return {
      satisfied: true,
      fillPrice,
      fees: fees.total_fees,
      feeBreakdown: fees,
      quoteAsOf: quoteCheck.asOf,
      quoteSource: quoteCheck.source,
      sessionName: session.session,
      reason: `BUY LIMIT filled at ₹${fillPrice.toFixed(2)} (within limit ₹${limitPrice.toFixed(2)}) on quote ₹${quotePrice.toFixed(2)}.`,
    };
  } else {
    if (quotePrice < limitPrice) {
      return {
        satisfied: false,
        quoteAsOf: quoteCheck.asOf,
        quoteSource: quoteCheck.source,
        sessionName: session.session,
        reason: `SELL LIMIT resting OPEN: Quote price ₹${quotePrice.toFixed(2)} is below limit ₹${limitPrice.toFixed(2)}.`,
      };
    }
    // At a SELL limit, fill at the limit or higher
    const rawFill = quotePrice * (1 - slipFrac);
    const fillPrice = Number(Math.max(limitPrice, rawFill).toFixed(2));
    const fees = calculateIndianEquityFees(
      fillPrice * params.order.quantity,
      'SELL',
      (params.order.product_type as any) || 'CNC'
    );
    return {
      satisfied: true,
      fillPrice,
      fees: fees.total_fees,
      feeBreakdown: fees,
      quoteAsOf: quoteCheck.asOf,
      quoteSource: quoteCheck.source,
      sessionName: session.session,
      reason: `SELL LIMIT filled at ₹${fillPrice.toFixed(2)} (within limit ₹${limitPrice.toFixed(2)}) on quote ₹${quotePrice.toFixed(2)}.`,
    };
  }
}

/**
 * Atomically transitions an OPEN paper limit order to FILLED in PostgreSQL.
 * Uses Prisma updateMany with `status: 'OPEN'` to guarantee idempotency and prevent duplicate fills.
 */
export async function executePaperLimitFill(
  prismaClient: any,
  params: {
    orderId: string;
    userId: string;
    fillPrice: number;
    fees: number;
    feeBreakdown?: any;
    slippageBps?: number;
    quoteAsOf?: string;
    quoteSource?: string;
    sessionName?: string;
    nowUtc?: Date;
  }
): Promise<{ filled: boolean; count: number; reason: string }> {
  const updateResult = await prismaClient.orderLog.updateMany({
    where: {
      id: params.orderId,
      user_id: params.userId,
      mode: 'PAPER',
      broker: 'PAPER',
      order_type: 'LIMIT',
      status: 'OPEN',
    },
    data: {
      status: 'FILLED',
      price: params.fillPrice,
      slippage_bps: params.slippageBps ?? 5,
      fees_inr: params.fees,
      quote_as_of: params.quoteAsOf || null,
      response_raw: JSON.stringify({
        mode: 'PAPER',
        market_session: params.sessionName || 'REGULAR',
        quote_source: params.quoteSource || 'live_feed',
        quote_as_of: params.quoteAsOf || null,
        fill_price: params.fillPrice,
        slippage_bps: params.slippageBps ?? 5,
        fees_inr: params.fees,
        fee_breakdown: params.feeBreakdown || null,
        filled_at: (params.nowUtc || new Date()).toISOString(),
        reason: `Paper LIMIT filled at ₹${params.fillPrice} on limit condition satisfaction.`,
      }),
    },
  });

  if (updateResult.count === 0) {
    return {
      filled: false,
      count: 0,
      reason: 'Order was already filled or cancelled concurrently (idempotency guard).',
    };
  }

  return {
    filled: true,
    count: 1,
    reason: `Order ${params.orderId} filled at ₹${params.fillPrice}.`,
  };
}

/**
 * Server-side evaluation of resting paper limit orders as fresh quotes arrive.
 * Can be invoked by server tick collectors or background worker processes even when browser is closed.
 * Atomically transitions resting OPEN orders that meet limit criteria to FILLED.
 */
export async function evaluateRestingPaperOrdersWithQuote(
  prismaClient: any,
  userId: string,
  quote: ServerQuotePayload,
  nowUtc?: Date
): Promise<{ evaluated: number; filled: number; results: Array<{ orderId: string; status: string; reason: string }> }> {
  const quoteSym = (quote.symbol || '').trim().toUpperCase();
  const quoteExch = (quote.exchange || '').trim().toUpperCase();
  if (!quoteSym || !['NSE', 'BSE'].includes(quoteExch)) {
    return { evaluated: 0, filled: 0, results: [] };
  }

  const openOrders = await prismaClient.orderLog.findMany({
    where: {
      user_id: userId,
      mode: 'PAPER',
      broker: 'PAPER',
      status: 'OPEN',
      symbol: quoteSym,
      exchange: quoteExch,
      order_type: 'LIMIT',
    },
  });

  const results: Array<{ orderId: string; status: string; reason: string }> = [];
  let filledCount = 0;

  for (const order of openOrders) {
    const satisfaction = checkPaperLimitSatisfaction({
      order: {
        id: order.id,
        symbol: order.symbol,
        exchange: order.exchange,
        transaction_type: order.transaction_type as any,
        quantity: order.quantity,
        order_type: order.order_type,
        product_type: order.product_type,
        price: order.price,
        placed_at: order.placed_at,
      },
      quote,
      nowUtc,
    });

    if (satisfaction.satisfied && satisfaction.fillPrice && satisfaction.fees !== undefined) {
      const fillRes = await executePaperLimitFill(prismaClient, {
        orderId: order.id,
        userId,
        fillPrice: satisfaction.fillPrice,
        fees: satisfaction.fees,
        feeBreakdown: satisfaction.feeBreakdown,
        quoteAsOf: satisfaction.quoteAsOf,
        quoteSource: satisfaction.quoteSource,
        sessionName: satisfaction.sessionName,
        nowUtc,
      });

      if (fillRes.filled) {
        filledCount++;
        results.push({ orderId: order.id, status: 'FILLED', reason: satisfaction.reason });
      } else {
        results.push({ orderId: order.id, status: 'OPEN', reason: fillRes.reason });
      }
    } else {
      results.push({ orderId: order.id, status: 'OPEN', reason: satisfaction.reason });
    }
  }

  return { evaluated: openOrders.length, filled: filledCount, results };
}


