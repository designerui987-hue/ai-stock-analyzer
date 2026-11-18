import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const AddWatchlistSchema = z.object({
  symbol: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(1, 'Stock symbol cannot be empty.')
        .max(20, 'Stock symbol must be 20 characters or fewer.')
        .regex(/^[A-Z0-9.\-&]+$/, 'Symbol must contain only valid alphanumeric characters, dots, ampersands, or hyphens.')
    ),
  exchange: z
    .string()
    .default('NSE')
    .transform((s) => s.trim().toUpperCase())
    .pipe(
      z.enum(['NSE', 'BSE'] as const, {
        message: "Unsupported exchange. Only 'NSE' and 'BSE' are supported.",
      })
    ),
  notes: z.string().max(255).optional(),
});

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const items = await prisma.watchlistItem.findMany({
      where: { user_id: userId },
      orderBy: { added_at: 'desc' },
    });

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        exchange: item.exchange,
        notes: item.notes,
        added_at: item.added_at.toISOString(),
      })),
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    if (err?.code === 'P1001' || err?.message?.includes("Can't reach database server")) {
      return NextResponse.json({
        success: false,
        status: 'unavailable',
        error: 'Database server is unreachable. Please verify DATABASE_URL and ensure PostgreSQL is running.',
        items: [],
        as_of: new Date().toISOString(),
      }, { status: 503 });
    }
    console.error('[Watchlist GET Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const body = await req.json();
    const parsed = AddWatchlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { symbol, exchange, notes } = parsed.data;

    const item = await prisma.watchlistItem.upsert({
      where: {
        user_id_symbol: {
          user_id: userId,
          symbol,
        },
      },
      update: {
        exchange,
        notes: notes !== undefined ? notes : undefined,
      },
      create: {
        user_id: userId,
        symbol,
        exchange,
        notes,
      },
    });

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        symbol: item.symbol,
        exchange: item.exchange,
        notes: item.notes,
        added_at: item.added_at.toISOString(),
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    if (err?.code === 'P1001' || err?.message?.includes("Can't reach database server")) {
      return NextResponse.json({
        success: false,
        status: 'unavailable',
        error: 'Database server is unreachable. Please verify DATABASE_URL and ensure PostgreSQL is running.',
      }, { status: 503 });
    }
    console.error('[Watchlist POST Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const { searchParams } = new URL(req.url);
    let symbol = searchParams.get('symbol');

    if (!symbol) {
      try {
        const body = await req.json();
        symbol = body.symbol;
      } catch {
        // ignore
      }
    }

    if (!symbol || !symbol.trim()) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }

    symbol = symbol.toUpperCase().trim();

    await prisma.watchlistItem.deleteMany({
      where: {
        user_id: userId,
        symbol,
      },
    });

    return NextResponse.json({ success: true, message: `Removed ${symbol} from watchlist` });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    if (err?.code === 'P1001' || err?.message?.includes("Can't reach database server")) {
      return NextResponse.json({
        success: false,
        status: 'unavailable',
        error: 'Database server is unreachable. Please verify DATABASE_URL and ensure PostgreSQL is running.',
      }, { status: 503 });
    }
    console.error('[Watchlist DELETE Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

