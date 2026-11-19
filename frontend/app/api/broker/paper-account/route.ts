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
    console.error('[Paper account fetch error]', err);
    if (isDbConnectionError(err)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Paper account database connection is temporarily unavailable.',
          unavailable: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
