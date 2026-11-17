import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateRestingPaperOrdersWithQuote } from '@/lib/orders/execution';
import { verifyCronSecret, getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const QuotePayloadSchema = z.object({
  symbol: z.string().trim().min(1).max(30).transform((symbol) => symbol.toUpperCase()),
  exchange: z.enum(['NSE', 'BSE']),
  price: z.number().positive(),
  exchange_timestamp: z.iso.datetime({ offset: true }),
  last_trade_timestamp: z.iso.datetime({ offset: true }),
});

export async function POST(req: Request) {
  try {
    if (!req.headers.get('x-cron-secret') || !req.headers.get('authorization')?.startsWith('Bearer ')) {
      throw new AuthError('Internal quote producer credentials required.');
    }
    verifyCronSecret(req);
    const userId = getVerifiedUserId(req);
    const parsed = QuotePayloadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid quote payload.' }, { status: 400 });
    }
    if (Date.parse(parsed.data.last_trade_timestamp) > Date.parse(parsed.data.exchange_timestamp)) {
      return NextResponse.json({ success: false, error: 'Trade timestamp exceeds exchange tick timestamp.' }, { status: 400 });
    }

    const evaluation = await evaluateRestingPaperOrdersWithQuote(prisma, userId, {
      ...parsed.data,
      source: 'kite_ws',
    });
    return NextResponse.json({
      success: true,
      evaluated: evaluation.evaluated,
      filled: evaluation.filled,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('[Paper order evaluation]', err);
    return NextResponse.json({ success: false, error: 'Paper orders could not be evaluated.' }, { status: 500 });
  }
}
