/**
 * Cron: Resolve open signals using real daily high/low bars since issued_at.
 *
 * Rules:
 *   - Strictly requires CRON_SECRET header (x-cron-secret).
 *   - If both stop and target fall inside one bar, count it as SL_HIT (conservative).
 *   - If signal was issued after market close (15:30 IST), uses next-day open for entry.
 *   - Supports SELL (short) and BUY (long) positions.
 *   - Closes at horizon_days as EXPIRED if neither target nor stop hit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveSignalWithBars, evaluateSignal, DailyBar } from '@/lib/signal-resolution';
import { sendAlert } from '@/lib/alerts/dispatch';
import { verifyCronSecret, AuthError } from '@/lib/auth/session';

/**
 * Fetch real daily OHLCV bars from unified backend market data service.
 */
async function fetchDailyBars(symbol: string): Promise<DailyBar[] | null> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/stocks/${encodeURIComponent(symbol)}/chart?period=3M`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data as DailyBar[];
      }
    }
  } catch (err) {
    console.warn(`[Resolve-Signals] Could not fetch bars for ${symbol}:`, err);
  }
  return null;
}

/**
 * Fallback live price fetch if bar history is unavailable.
 */
async function getLivePrice(symbol: string): Promise<number | null> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${backendUrl}/api/stocks/quote/${encodeURIComponent(symbol)}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.price === 'number' && data.price > 0) return data.price;
    }
  } catch {
    return null;
  }
  return null;
}

async function handleResolution(req: Request) {
  try {
    // Strictly require CRON_SECRET
    verifyCronSecret(req);

    const openSignals = await prisma.signal.findMany({
      where: { status: 'OPEN' },
    });

    const currentDate = new Date();
    const results = {
      evaluated: 0,
      resolved: 0,
      bars_evaluated: 0,
      price_unavailable: 0,
      resolutions: {} as Record<string, number>,
    };

    for (const signal of openSignals) {
      results.evaluated++;

      // 1. Attempt resolution using real daily high/low bars since issued_at
      const bars = await fetchDailyBars(signal.symbol);

      let resolution = null;
      if (bars && bars.length > 0) {
        results.bars_evaluated++;
        resolution = resolveSignalWithBars(
          {
            id: signal.id,
            symbol: signal.symbol,
            signal_type: signal.signal_type,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss_price: signal.stop_loss_price,
            issued_at: signal.issued_at,
            horizon_days: signal.horizon_days,
            rule_version: signal.rule_version,
            source: signal.source,
          },
          bars,
          currentDate
        );
      } else {
        // Fallback to current live price if bar chart is temporarily unavailable
        const currentPrice = await getLivePrice(signal.symbol);
        if (currentPrice === null) {
          results.price_unavailable++;
          continue;
        }
        resolution = evaluateSignal(
          {
            signal_type: signal.signal_type,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss_price: signal.stop_loss_price,
            issued_at: signal.issued_at,
            horizon_days: signal.horizon_days,
          },
          currentPrice,
          currentDate
        );
      }

      if (resolution && resolution.status !== 'OPEN') {
        await prisma.signal.update({
          where: { id: signal.id },
          data: {
            status: resolution.status,
            closed_at: resolution.closed_at || currentDate,
            closed_price: resolution.closed_price,
            realized_pnl_pct: resolution.realized_pnl_pct,
          },
        });

        // Dispatch alert on meaningful resolution
        if (resolution.status === 'TARGET_HIT' || resolution.status === 'SL_HIT') {
          const alertType = resolution.status === 'TARGET_HIT' ? 'target_hit' : 'sl_hit';
          await sendAlert('system', alertType, {
            symbol: signal.symbol,
            signal_type: signal.signal_type as any,
            price: resolution.closed_price ?? signal.entry_price,
            entry_price: resolution.effective_entry_price ?? signal.entry_price,
            target_price: signal.target_price,
            stop_loss_price: signal.stop_loss_price,
            confidence_pct: signal.confidence_pct,
            closed_price: resolution.closed_price ?? signal.entry_price,
            pnl_pct: resolution.realized_pnl_pct ?? 0,
          });
        }

        results.resolved++;
        results.resolutions[resolution.status] =
          (results.resolutions[resolution.status] ?? 0) + 1;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('Error resolving signals:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleResolution(req);
}

export async function POST(req: NextRequest) {
  return handleResolution(req);
}
