import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const status = searchParams.get('status');
    const minConfidence = searchParams.get('min_confidence');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Build Where clause
    const where: Prisma.SignalWhereInput = {};
    if (symbol) where.symbol = { equals: symbol.toUpperCase() };
    if (status) where.status = { equals: status };
    if (minConfidence) where.confidence_pct = { gte: parseFloat(minConfidence) };

    if (dateFrom || dateTo) {
      where.issued_at = {};
      if (dateFrom) where.issued_at.gte = new Date(dateFrom);
      if (dateTo) where.issued_at.lte = new Date(dateTo);
    }

    const signals = await prisma.signal.findMany({
      where,
      orderBy: { issued_at: 'desc' },
    });

    // Compute stats from ALL closed signals (TARGET_HIT, SL_HIT, EXPIRED)
    const closedSignals = signals.filter((s) => s.status !== 'OPEN');
    const totalClosed = closedSignals.length;

    let targetHits = 0;
    let slHits = 0;
    let expiredCount = 0;
    let totalPnl = 0;
    let totalHoldingDays = 0;

    // For confidence calibration buckets: "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"
    const buckets: Record<string, { total: number; hits: number }> = {
      '40-49': { total: 0, hits: 0 },
      '50-59': { total: 0, hits: 0 },
      '60-69': { total: 0, hits: 0 },
      '70-79': { total: 0, hits: 0 },
      '80-89': { total: 0, hits: 0 },
      '90-100': { total: 0, hits: 0 },
    };

    closedSignals.forEach((s) => {
      if (s.status === 'TARGET_HIT') targetHits++;
      else if (s.status === 'SL_HIT') slHits++;
      else if (s.status === 'EXPIRED') expiredCount++;

      if (typeof s.realized_pnl_pct === 'number') {
        totalPnl += s.realized_pnl_pct;
      }

      if (s.closed_at) {
        const holdingDays =
          (new Date(s.closed_at).getTime() - new Date(s.issued_at).getTime()) /
          (1000 * 60 * 60 * 24);
        totalHoldingDays += Math.max(0, holdingDays);
      }

      // Calibration bucket assignment
      let bucketStr = '';
      if (s.confidence_pct >= 90) bucketStr = '90-100';
      else if (s.confidence_pct >= 80) bucketStr = '80-89';
      else if (s.confidence_pct >= 70) bucketStr = '70-79';
      else if (s.confidence_pct >= 60) bucketStr = '60-69';
      else if (s.confidence_pct >= 50) bucketStr = '50-59';
      else bucketStr = '40-49';

      if (bucketStr && buckets[bucketStr]) {
        buckets[bucketStr].total++;
        if (s.status === 'TARGET_HIT') buckets[bucketStr].hits++;
      }
    });

    // 1. Win Rate = TARGET_HIT / Total Closed
    const winRate = totalClosed > 0 ? (targetHits / totalClosed) * 100 : 0;

    // 2. Average Return
    const avgReturn = totalClosed > 0 ? totalPnl / totalClosed : 0;

    // 3. Trade Count
    const tradeCount = totalClosed;

    // 4. Max Drawdown Calculation from Chronological Equity Curve
    const closedChronological = [...closedSignals].sort((a, b) => {
      const timeA = a.closed_at ? new Date(a.closed_at).getTime() : new Date(a.issued_at).getTime();
      const timeB = b.closed_at ? new Date(b.closed_at).getTime() : new Date(b.issued_at).getTime();
      return timeA - timeB;
    });

    let equity = 100.0;
    let peakEquity = 100.0;
    let maxDrawdown = 0.0;

    for (const s of closedChronological) {
      const pnl = s.realized_pnl_pct ?? 0;
      equity = equity * (1 + pnl / 100);
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    const avgHoldingDays = totalClosed > 0 ? totalHoldingDays / totalClosed : 0;

    // Calibration chart data
    const calibrationData = Object.keys(buckets).map((bucket) => {
      const b = buckets[bucket];
      return {
        bucket,
        hitRate: b.total > 0 ? Math.round((b.hits / b.total) * 1000) / 10 : 0,
        sampleSize: b.total,
        midpoint: parseInt(bucket.split('-')[0]) + 5,
      };
    });

    // Minimum-sample warning below 30 closed signals per specification
    const isSampleSufficient = totalClosed >= 30;
    const sampleWarning = !isSampleSufficient
      ? `Statistical Sample Warning: Only ${totalClosed} closed signals recorded. A minimum sample size of 30 closed signals is required before win rates and drawdown statistics become statistically meaningful. Current figures are preliminary.`
      : null;

    return NextResponse.json({
      success: true,
      stats: {
        winRate: Math.round(winRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
        avgPnl: Math.round(avgReturn * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        tradeCount,
        totalClosed,
        totalSignals: signals.length,
        openSignals: signals.length - totalClosed,
        targetHits,
        slHits,
        expiredCount,
        avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
        isSampleSufficient,
        sampleWarning,
        calibrationData,
      },
      signals,
    });
  } catch (error: any) {
    console.error('Error fetching ledger:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
