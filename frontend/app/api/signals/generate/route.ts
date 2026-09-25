import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DEMO_AI_PICKS, DEMO_STOCKS } from '@/lib/data';
import { sendAlert } from '@/lib/alerts/dispatch';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const count = parseInt(searchParams.get('count') || '1', 10);

    const createdSignals = [];

    for (let i = 0; i < count; i++) {
      // Pick a random stock from our AI picks or general stocks
      const isPick = Math.random() > 0.5;
      const sourceList = isPick ? DEMO_AI_PICKS : DEMO_STOCKS;
      const stock = sourceList[Math.floor(Math.random() * sourceList.length)];
      
      const currentPrice = stock.price;
      
      // Determine signal type (buy/sell) - bias slightly towards buy
      const signalType = Math.random() > 0.4 ? 'BUY' : 'SELL';
      
      // Calculate realistic target and SL based on volatility
      // e.g., 5-15% target, 3-8% SL
      const targetPct = 0.05 + Math.random() * 0.10;
      const slPct = 0.03 + Math.random() * 0.05;
      
      const targetPrice = signalType === 'BUY' 
        ? currentPrice * (1 + targetPct) 
        : currentPrice * (1 - targetPct);
        
      const slPrice = signalType === 'BUY'
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct);
        
      const confidence = Math.floor(55 + Math.random() * 40); // 55% to 95%
      
      // Mock models
      const models = [
        { name: 'XGBoost', signal: signalType, conf: confidence + Math.floor(Math.random() * 10 - 5) },
        { name: 'LightGBM', signal: signalType, conf: confidence + Math.floor(Math.random() * 10 - 5) },
        { name: 'Neural Net', signal: Math.random() > 0.8 ? (signalType === 'BUY' ? 'HOLD' : 'BUY') : signalType, conf: confidence - 10 },
      ];
      
      const rationale = `Generated technical pattern breakout detected. Volume surge above 20-day moving average indicating strong ${signalType.toLowerCase()} momentum.`;
      
      // Backdate issued_at by up to 30 days for testing, or just use now
      const backdateDays = Math.floor(Math.random() * 30);
      const issuedAt = new Date();
      issuedAt.setDate(issuedAt.getDate() - backdateDays);

      const signal = await prisma.signal.create({
        data: {
          symbol: stock.symbol,
          signal_type: signalType,
          issued_at: issuedAt,
          entry_price: currentPrice,
          target_price: targetPrice,
          stop_loss_price: slPrice,
          confidence_pct: confidence,
          model_breakdown: JSON.stringify(models),
          status: 'OPEN',
          horizon_days: 5 + Math.floor(Math.random() * 20), // 5 to 25 days
          rationale: rationale,
        }
      });

      // Dispatch Multi-Channel Alert for new signal
      await sendAlert('demo_user', 'new_signal', {
        symbol: stock.symbol,
        signal_type: signalType as any,
        price: currentPrice,
        entry_price: currentPrice,
        target_price: targetPrice,
        stop_loss_price: slPrice,
        confidence_pct: confidence,
        rationale: rationale,
      });
      
      createdSignals.push(signal);
    }

    return NextResponse.json({ success: true, count, signals: createdSignals });
  } catch (error: any) {
    console.error('Error generating signals:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
