/**
 * Server-side Quote Ingestion & Paper Limit Order Evaluation Route
 *
 * Requirements:
 * "Use the existing server-side quote pipeline to evaluate resting paper orders
 *  as eligible quotes arrive, even when the browser is closed. Make orders GET read-only."
 * "Reuse the existing fill logic. Require an explicit instrument and exchange match,
 *  a valid positive price, and a fresh exchange timestamp during an eligible session.
 *  Reject mismatched symbols, missing exchanges, future timestamps outside a documented
 *  clock-skew tolerance, and quotes older than the order."
 * "Make the OPEN -> FILLED transition atomic. Repeated quotes, concurrent workers,
 *  and restarts must produce one fill and one fee entry. Buy fills must respect
 *  the maximum limit price. Sell fills must respect the minimum."
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateRestingPaperOrdersWithQuote, ServerQuotePayload } from '@/lib/orders/execution';
import { verifyCronSecret, getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const QuotePayloadSchema = z.object({
  symbol: z.string().min(1).max(20),
  exchange: z.string().min(1).max(10),
  price: z.number().positive(),
  source: z.string().min(1),
  as_of: z.string().min(1),
  exchange_timestamp: z.string().optional(),
  status: z.string().optional(),
  freshness: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Authorized via CRON_SECRET or authenticated user session
    const cronHeader = req.headers.get('x-cron-secret');
    let authorized = false;

    if (cronHeader && process.env.CRON_SECRET && cronHeader === process.env.CRON_SECRET) {
      authorized = true;
    } else {
      try {
        getVerifiedUserId(req);
        authorized = true;
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: requires valid session token or CRON_SECRET header.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = QuotePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid quote payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const quote: ServerQuotePayload = {
      symbol: parsed.data.symbol.trim().toUpperCase(),
      exchange: parsed.data.exchange.trim().toUpperCase(),
      price: parsed.data.price,
      source: parsed.data.source,
      as_of: parsed.data.as_of,
      exchange_timestamp: parsed.data.exchange_timestamp,
      status: parsed.data.status,
      freshness: parsed.data.freshness,
    };

    const evaluation = await evaluateRestingPaperOrdersWithQuote(prisma, quote);

    return NextResponse.json({
      success: true,
      evaluated: evaluation.evaluated,
      filled: evaluation.filled,
      results: evaluation.results,
    });
  } catch (err: any) {
    console.error('Error evaluating resting orders with quote:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
