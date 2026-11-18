/**
 * Paper Trading Virtual Account & Ledger Accounting
 *
 * Invariants:
 * - Starting Virtual Capital: ₹1,000,000.00
 * - Authoritative source of truth: PostgreSQL `OrderLog` with mode = 'PAPER'
 * - Buying Power: Cash balance minus reserved funds for open BUY orders
 * - Position Inventory: Net filled quantity minus reserved quantity for open SELL orders
 * - Short selling is prohibited for CNC (Delivery) products
 * - Atomic accounting with single fee entry per fill
 * - Execution-order chronology: Fills sequenced by execution timestamp
 * - Bracket exits (Target & Stop Loss) share linked reservation to avoid inventory double-counting
 */

import { calculateIndianEquityFees } from './execution';

export const INITIAL_PAPER_CAPITAL = 1_000_000.0; // ₹10,00,000.00

export interface PaperPositionState {
  symbol: string;
  quantity: number;
  avg_price: number;
  total_invested: number;
  reserved_quantity: number;
  available_quantity: number;
}

export interface PaperAccountSummary {
  starting_capital: number;
  cash_balance: number;
  reserved_cash: number;
  available_cash: number;
  realized_pnl: number;
  total_fees: number;
  positions: Record<string, PaperPositionState>;
  open_orders_count: number;
  filled_orders_count: number;
}

/**
 * Extracts the true execution timestamp for an order.
 * Uses filled_at / executed_at when present in response_raw or order fields;
 * falls back to placed_at for legacy records without fabricating execution history.
 */
export function getExecutionTimestamp(ord: any): number {
  if (ord.executed_at) {
    const t = new Date(ord.executed_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (ord.response_raw) {
    try {
      const raw = typeof ord.response_raw === 'string' ? JSON.parse(ord.response_raw) : ord.response_raw;
      const tStr = raw?.executed_at || raw?.filled_at;
      if (tStr) {
        const t = new Date(tStr).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    } catch {}
  }
  return new Date(ord.placed_at || 0).getTime();
}

export function computePaperAccountState(orders: any[]): PaperAccountSummary {
  let cash = INITIAL_PAPER_CAPITAL;
  let reservedCash = 0;
  let realizedPnl = 0;
  let totalFees = 0;
  let openOrdersCount = 0;
  let filledOrdersCount = 0;

  const positions: Record<string, PaperPositionState> = {};

  const ensurePos = (sym: string): PaperPositionState => {
    if (!positions[sym]) {
      positions[sym] = {
        symbol: sym,
        quantity: 0,
        avg_price: 0,
        total_invested: 0,
        reserved_quantity: 0,
        available_quantity: 0,
      };
    }
    return positions[sym];
  };

  const paperOrders = orders.filter((o) => o.mode === 'PAPER' || o.broker === 'PAPER');

  // 1. Process FILLED orders in true execution order
  const filledOrders = paperOrders.filter(
    (o) => o.status === 'FILLED' || o.status === 'COMPLETE'
  );

  filledOrders.sort((a, b) => {
    const timeA = getExecutionTimestamp(a);
    const timeB = getExecutionTimestamp(b);
    if (timeA !== timeB) return timeA - timeB;
    const placedA = new Date(a.placed_at || 0).getTime();
    const placedB = new Date(b.placed_at || 0).getTime();
    if (placedA !== placedB) return placedA - placedB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  for (const ord of filledOrders) {
    const sym = (ord.symbol || '').trim().toUpperCase();
    const qty = Number(ord.quantity || 0);
    const price = Number(ord.price || 0);
    const fees = Number(ord.fees_inr || 0);

    filledOrdersCount++;
    totalFees += fees;

    const curPos = ensurePos(sym);

    if (ord.transaction_type === 'BUY') {
      const notional = qty * price;
      const totalCost = notional + fees;
      cash -= totalCost;

      // Update long position cost basis
      const newQty = curPos.quantity + qty;
      const newInvested = curPos.total_invested + totalCost;
      curPos.quantity = newQty;
      curPos.total_invested = newInvested;
      curPos.avg_price = newQty > 0 ? newInvested / newQty : 0;
    } else if (ord.transaction_type === 'SELL') {
      const notional = qty * price;
      const netProceeds = notional - fees;
      cash += netProceeds;

      // Calculate realized P&L based on average cost
      const costBasisOfSoldShares = curPos.quantity > 0 ? (curPos.total_invested / curPos.quantity) * qty : 0;
      const tradeRealizedPnl = netProceeds - costBasisOfSoldShares;
      realizedPnl += tradeRealizedPnl;

      curPos.quantity = Math.max(0, curPos.quantity - qty);
      curPos.total_invested = Math.max(0, curPos.total_invested - costBasisOfSoldShares);
      curPos.avg_price = curPos.quantity > 0 ? curPos.total_invested / curPos.quantity : 0;
    }
  }

  // 2. Process OPEN orders for cash and inventory reservations
  const openOrders = paperOrders.filter(
    (o) => o.status === 'OPEN' || o.status === 'ACCEPTED'
  );

  // For SELL orders: track bracket exits (grouped by parent_order_id) vs independent sell orders
  // Alternative exits (Target & SL) on the same parent order share reservation (max(tgt, sl))
  const bracketSellReservations: Record<string, Record<string, number>> = {}; // sym -> { parent_id: maxQty }
  const independentSellReservations: Record<string, number> = {}; // sym -> sumQty

  for (const ord of openOrders) {
    openOrdersCount++;
    const sym = (ord.symbol || '').trim().toUpperCase();
    const qty = Number(ord.quantity || 0);
    const price = Number(ord.price || 0);

    ensurePos(sym);

    if (ord.transaction_type === 'BUY') {
      // Reserve cash for resting limit buy: order notional + estimated fees
      const estimatedFees = calculateIndianEquityFees(qty * price, 'BUY', ord.product_type || 'CNC').total_fees;
      reservedCash += qty * price + estimatedFees;
    } else if (ord.transaction_type === 'SELL') {
      let parentOrderId: string | null = null;
      if (ord.source === 'ATTACHED_TARGET' || ord.source === 'ATTACHED_STOP_LOSS') {
        try {
          const raw = typeof ord.response_raw === 'string' ? JSON.parse(ord.response_raw) : ord.response_raw;
          parentOrderId = raw?.parent_order_id || null;
        } catch {}
      }

      if (parentOrderId) {
        if (!bracketSellReservations[sym]) bracketSellReservations[sym] = {};
        bracketSellReservations[sym][parentOrderId] = Math.max(bracketSellReservations[sym][parentOrderId] || 0, qty);
      } else {
        independentSellReservations[sym] = (independentSellReservations[sym] || 0) + qty;
      }
    }
  }

  // Compute total reserved quantity and available quantity for each position
  for (const [sym, pos] of Object.entries(positions)) {
    const bracketTotal = Object.values(bracketSellReservations[sym] || {}).reduce((sum, q) => sum + q, 0);
    const independentTotal = independentSellReservations[sym] || 0;
    pos.reserved_quantity = bracketTotal + independentTotal;
    pos.available_quantity = Math.max(0, pos.quantity - pos.reserved_quantity);
  }

  const availableCash = Math.max(0, cash - reservedCash);

  return {
    starting_capital: INITIAL_PAPER_CAPITAL,
    cash_balance: Number(cash.toFixed(2)),
    reserved_cash: Number(reservedCash.toFixed(2)),
    available_cash: Number(availableCash.toFixed(2)),
    realized_pnl: Number(realizedPnl.toFixed(2)),
    total_fees: Number(totalFees.toFixed(2)),
    positions,
    open_orders_count: openOrdersCount,
    filled_orders_count: filledOrdersCount,
  };
}

export async function getPaperAccountState(prismaClient: any, userId: string): Promise<PaperAccountSummary> {
  const orders = await prismaClient.orderLog.findMany({
    where: {
      user_id: userId,
      mode: 'PAPER',
    },
    orderBy: { placed_at: 'asc' },
  });

  return computePaperAccountState(orders);
}

const inMemoryAccountLocks = new Map<string, Promise<void>>();

/**
 * Concurrency-safe execution wrapper across paper account mutations.
 * Combines an in-process async mutex with a PostgreSQL transaction-level advisory lock
 * (`pg_advisory_xact_lock`) to serialize account balance checks, reservations, order creation,
 * fills, cancellations, and exits across concurrent workers and requests.
 */
export async function withAccountLock<T>(
  prismaClient: any,
  userId: string,
  operation: (tx: any) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  while (inMemoryAccountLocks.has(userId)) {
    try {
      await inMemoryAccountLocks.get(userId);
    } catch {}
  }

  let releaseMutex: () => void = () => {};
  const mutexPromise = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });
  inMemoryAccountLocks.set(userId, mutexPromise);

  try {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        if (typeof prismaClient.$transaction === 'function') {
          return await prismaClient.$transaction(
            async (tx: any) => {
              try {
                if (typeof tx.$executeRawUnsafe === 'function') {
                  await tx.$executeRawUnsafe(
                    `SELECT pg_advisory_xact_lock(hashtext('paper_account_' || $1))`,
                    userId
                  );
                }
              } catch {
                // If using SQLite or a mock without PostgreSQL advisory lock functions,
                // the in-process mutex above provides serialization.
              }
              return await operation(tx);
            },
            {
              timeout: 15000,
              maxWait: 5000,
            }
          );
        } else {
          return await operation(prismaClient);
        }
      } catch (err: any) {
        const isConflict =
          err?.code === 'P2034' ||
          err?.code === '40P01' ||
          err?.code === '40001' ||
          (typeof err?.message === 'string' && err.message.includes('deadlock'));

        if (isConflict && attempt < maxRetries) {
          const delayMs = Math.floor(50 * Math.pow(2, attempt) + Math.random() * 25);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
  } finally {
    inMemoryAccountLocks.delete(userId);
    releaseMutex();
  }
}

