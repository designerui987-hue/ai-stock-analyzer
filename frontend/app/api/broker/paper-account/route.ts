import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { getPaperAccountState } from '@/lib/orders/paper-account';

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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
