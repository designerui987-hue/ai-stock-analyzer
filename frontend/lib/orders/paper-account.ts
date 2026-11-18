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

export function computePaperAccountState(orders: any[]): PaperAccountSummary {
  let cash = INITIAL_PAPER_CAPITAL;
  let reservedCash = 0;
  let realizedPnl = 0;
  let totalFees = 0;
  let openOrdersCount = 0;
  let filledOrdersCount = 0;

  const positions: Record<string, PaperPositionState> = {};

  // Sort orders by placed_at ascending to calculate running position avg cost correctly
  const sorted = [...orders].sort((a, b) => {
    const timeA = new Date(a.placed_at || 0).getTime();
    const timeB = new Date(b.placed_at || 0).getTime();
    return timeA - timeB;
  });

  for (const ord of sorted) {
    if (ord.mode !== 'PAPER' && ord.broker !== 'PAPER') continue;

    const sym = (ord.symbol || '').trim().toUpperCase();
    const qty = Number(ord.quantity || 0);
    const price = Number(ord.price || 0);
    const fees = Number(ord.fees_inr || 0);
    const status = ord.status;

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

    if (status === 'FILLED' || status === 'COMPLETE') {
      filledOrdersCount++;
      totalFees += fees;

      if (ord.transaction_type === 'BUY') {
        const notional = qty * price;
        const totalCost = notional + fees;
        cash -= totalCost;

        // Update long position cost basis
        const curPos = positions[sym];
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
        const curPos = positions[sym];
        const costBasisOfSoldShares = curPos.quantity > 0 ? (curPos.total_invested / curPos.quantity) * qty : 0;
        const tradeRealizedPnl = netProceeds - costBasisOfSoldShares;
        realizedPnl += tradeRealizedPnl;

        curPos.quantity = Math.max(0, curPos.quantity - qty);
        curPos.total_invested = Math.max(0, curPos.total_invested - costBasisOfSoldShares);
        curPos.avg_price = curPos.quantity > 0 ? curPos.total_invested / curPos.quantity : 0;
      }
    } else if (status === 'OPEN' || status === 'ACCEPTED') {
      openOrdersCount++;

      if (ord.transaction_type === 'BUY') {
        // Reserve cash for resting limit buy: order notional + estimated fees
        const estimatedFees = calculateIndianEquityFees(qty * price, 'BUY', ord.product_type || 'CNC').total_fees;
        reservedCash += qty * price + estimatedFees;
      } else if (ord.transaction_type === 'SELL') {
        // Reserve shares for resting limit sell
        positions[sym].reserved_quantity += qty;
      }
    }
  }

  // Calculate available quantity for each position
  for (const pos of Object.values(positions)) {
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
