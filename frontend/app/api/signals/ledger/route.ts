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
      orderBy: { issued_at: 'desc' }
    });

    // Compute stats from ALL matching signals
    let totalClosed = 0;
    let targetHits = 0;
    let totalPnl = 0;
    let totalHoldingDays = 0;
    
    // For calibration: map of bucket string -> { total: number, hits: number }
    // Buckets: "50-59", "60-69", "70-79", "80-89", "90-100"
    const buckets: Record<string, { total: number, hits: number }> = {
      "50-59": { total: 0, hits: 0 },
      "60-69": { total: 0, hits: 0 },
      "70-79": { total: 0, hits: 0 },
      "80-89": { total: 0, hits: 0 },
      "90-100": { total: 0, hits: 0 },
    };

    signals.forEach(s => {
      if (s.status !== 'OPEN' && s.status !== 'EXPIRED') { // EXPIRED might be debatable for win rate, but let's count TARGET vs (TARGET+SL). Or include expired? The prompt: "Win rate (% of TARGET_HIT vs total closed)".
        if (s.status === 'TARGET_HIT' || s.status === 'SL_HIT' || s.status === 'EXPIRED') {
          totalClosed++;
          if (s.status === 'TARGET_HIT') targetHits++;
          if (s.realized_pnl_pct !== null) totalPnl += s.realized_pnl_pct;
          
          if (s.closed_at) {
            const holdingDays = (s.closed_at.getTime() - s.issued_at.getTime()) / (1000 * 60 * 60 * 24);
            totalHoldingDays += holdingDays;
          }

          // Calibration Logic
          let bucketStr = "";
          if (s.confidence_pct >= 90) bucketStr = "90-100";
          else if (s.confidence_pct >= 80) bucketStr = "80-89";
          else if (s.confidence_pct >= 70) bucketStr = "70-79";
          else if (s.confidence_pct >= 60) bucketStr = "60-69";
          else if (s.confidence_pct >= 50) bucketStr = "50-59";
          
          if (bucketStr && buckets[bucketStr]) {
            buckets[bucketStr].total++;
            if (s.status === 'TARGET_HIT') buckets[bucketStr].hits++;
          }
        }
      }
    });

    const winRate = totalClosed > 0 ? (targetHits / totalClosed) * 100 : 0;
    const avgPnl = totalClosed > 0 ? (totalPnl / totalClosed) : 0;
    const avgHoldingDays = totalClosed > 0 ? (totalHoldingDays / totalClosed) : 0;

    const calibrationData = Object.keys(buckets).map(bucket => {
      const b = buckets[bucket];
      return {
        bucket,
        hitRate: b.total > 0 ? (b.hits / b.total) * 100 : 0,
        sampleSize: b.total,
        // Calculate the midpoint for perfectly calibrated reference
        expectedWinRate: bucket === "90-100" ? 95 : parseInt(bucket.split('-')[0]) + 5
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        winRate,
        totalSignals: signals.length,
        totalClosed,
        avgPnl,
        avgHoldingDays,
        calibrationData
      },
      signals
    });
  } catch (error: any) {
    console.error('Error fetching ledger:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
