import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateSignal } from '@/lib/signal-resolution';
import { DEMO_STOCKS, DEMO_AI_PICKS } from '@/lib/data';
import { sendAlert } from '@/lib/alerts/dispatch';

// Helper to simulate a "live" price based on the static demo price
function getMockCurrentPrice(symbol: string, entryPrice: number, daysOpen: number): number {
  // Try to find the stock in our static lists to get a baseline
  const stock = DEMO_STOCKS.find(s => s.symbol === symbol) || DEMO_AI_PICKS.find(s => s.symbol === symbol);
  let basePrice = stock ? stock.price : entryPrice;
  
  // Simulate some volatility based on how many days it's been open
  // e.g. up to 2% drift per day
  const driftFactor = (Math.random() - 0.5) * 2; // -1 to +1
  const dailyVolatility = 0.02; 
  
  // Cap at 20% total drift to keep it somewhat realistic
  let maxDrift = Math.min(daysOpen * dailyVolatility, 0.20);
  
  // Let's add an explicit bias to ensure we get some targets hit and SLs hit
  // 30% chance to drift hard in one direction
  if (Math.random() > 0.7) {
     maxDrift = 0.15;
  }

  const simulatedPrice = basePrice * (1 + (driftFactor * maxDrift));
  return parseFloat(simulatedPrice.toFixed(2));
}

export async function GET(req: Request) {
  try {
    const openSignals = await prisma.signal.findMany({
      where: { status: 'OPEN' }
    });

    const currentDate = new Date();
    const results = {
      evaluated: 0,
      resolved: 0,
      resolutions: {} as Record<string, number>
    };

    for (const signal of openSignals) {
      const daysOpen = Math.floor((currentDate.getTime() - signal.issued_at.getTime()) / (1000 * 60 * 60 * 24));
      
      const currentPrice = getMockCurrentPrice(signal.symbol, signal.entry_price, daysOpen);
      
      const resolution = evaluateSignal({
        signal_type: signal.signal_type,
        entry_price: signal.entry_price,
        target_price: signal.target_price,
        stop_loss_price: signal.stop_loss_price,
        issued_at: signal.issued_at,
        horizon_days: signal.horizon_days,
      }, currentPrice, currentDate);

      if (resolution.status !== 'OPEN') {
        await prisma.signal.update({
          where: { id: signal.id },
          data: {
            status: resolution.status,
            closed_at: resolution.closed_at,
            closed_price: resolution.closed_price,
            realized_pnl_pct: resolution.realized_pnl_pct,
          }
        });

        // Dispatch Multi-Channel Alert for TARGET_HIT or SL_HIT
        if (resolution.status === 'TARGET_HIT' || resolution.status === 'SL_HIT') {
          const alertType = resolution.status === 'TARGET_HIT' ? 'target_hit' : 'sl_hit';
          await sendAlert('demo_user', alertType, {
            symbol: signal.symbol,
            signal_type: signal.signal_type as any,
            price: currentPrice,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss_price: signal.stop_loss_price,
            confidence_pct: signal.confidence_pct,
            closed_price: resolution.closed_price || currentPrice,
            pnl_pct: resolution.realized_pnl_pct || 0,
          });
        }
        
        results.resolved++;
        results.resolutions[resolution.status] = (results.resolutions[resolution.status] || 0) + 1;
      }
      
      results.evaluated++;
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Error resolving signals:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
