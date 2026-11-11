/**
 * Signal Generation API Route (Protected Cron)
 *
 * Generates signals exclusively from deterministic quantitative rules on real data
 * (trend + RSI + volume surge + ATR stops).
 *
 * Rules:
 *   - Strictly requires CRON_SECRET header (x-cron-secret).
 *   - Stores rule_version, source, and as_of on each signal.
 *   - Transparent confidence score computed via docs/CONFIDENCE.md formula.
 *   - Dynamic ATR-based stops and targets (2:1 reward-to-risk ratio).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret, AuthError } from '@/lib/auth/session';
import { generateDeterministicSignal, DailyBar } from '@/lib/deterministic-signals';
import { getServerBackendUrl } from '@/lib/api';

const DEFAULT_UNIVERSE = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'BHARTIARTL',
  'SBIN',
  'ITC',
  'LT',
  'TATAMOTORS',
];

async function fetchRealBars(symbol: string): Promise<DailyBar[] | null> {
  try {
    const backendUrl = getServerBackendUrl();
    const res = await fetch(`${backendUrl}/api/stocks/${encodeURIComponent(symbol)}/chart?period=1Y`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length >= 20) {
      return data as DailyBar[];
    }
  } catch (err) {
    console.warn(`[Signal Generation] Could not fetch real bars for ${symbol}:`, err);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    // Strictly require CRON_SECRET
    verifyCronSecret(req);

    let symbolsToScan = DEFAULT_UNIVERSE;
    try {
      const body = await req.json();
      if (body?.symbols && Array.isArray(body.symbols) && body.symbols.length > 0) {
        symbolsToScan = body.symbols.map((s: string) => s.toUpperCase());
      }
    } catch {
      // Empty body is fine, uses default universe
    }

    const createdSignals: any[] = [];
    const skipped: any[] = [];

    for (const sym of symbolsToScan) {
      // Check if an OPEN signal already exists for this symbol
      const existingOpen = await prisma.signal.findFirst({
        where: { symbol: sym, status: 'OPEN' },
      });

      if (existingOpen) {
        skipped.push({ symbol: sym, reason: 'Active OPEN signal already exists' });
        continue;
      }

      // Fetch real OHLCV daily bars from unified backend
      const bars = await fetchRealBars(sym);
      if (!bars || bars.length < 20) {
        skipped.push({ symbol: sym, reason: 'Insufficient real bar history from market data' });
        continue;
      }

      // Generate deterministic signal
      const signal = generateDeterministicSignal(sym, bars);
      if (!signal || signal.signal_type === 'HOLD') {
        skipped.push({ symbol: sym, reason: 'No clear directional consensus (HOLD)' });
        continue;
      }

      // Persist signal to database with rule_version, source, as_of
      const created = await prisma.signal.create({
        data: {
          symbol: signal.symbol,
          signal_type: signal.signal_type,
          entry_price: signal.entry_price,
          target_price: signal.target_price,
          stop_loss_price: signal.stop_loss_price,
          confidence_pct: signal.confidence_pct,
          horizon_days: signal.horizon_days,
          rationale: signal.rationale,
          rule_version: signal.rule_version,
          source: signal.source,
          as_of: new Date(signal.as_of),
          model_breakdown: signal.model_breakdown,
          status: 'OPEN',
        },
      });

      createdSignals.push(created);
    }

    return NextResponse.json({
      success: true,
      scanned: symbolsToScan.length,
      generated_count: createdSignals.length,
      signals: createdSignals,
      skipped,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Error generating signals:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
