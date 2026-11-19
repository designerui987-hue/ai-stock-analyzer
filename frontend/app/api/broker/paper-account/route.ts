import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { getPaperAccountState, INITIAL_PAPER_CAPITAL } from '@/lib/orders/paper-account';
import { isDbConnectionError } from '@/lib/db-fallback';

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const summary = await getPaperAccountState(prisma, userId);

    return NextResponse.json({
      success: true,
      account: summary,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    if (isDbConnectionError(err)) {
      return NextResponse.json({
        success: true,
        account: {
          starting_capital: INITIAL_PAPER_CAPITAL,
          cash_balance: INITIAL_PAPER_CAPITAL,
          reserved_cash: 0,
          available_cash: INITIAL_PAPER_CAPITAL,
          realized_pnl: 0,
          total_fees: 0,
          positions: {},
          open_orders_count: 0,
          filled_orders_count: 0,
        },
        source: 'local_storage_fallback',
      });
    }
    console.error('[Paper account fetch error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
