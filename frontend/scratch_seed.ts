import { prisma } from './lib/prisma.ts';
import { DEMO_AI_PICKS, DEMO_STOCKS } from './lib/data.ts';
import { evaluateSignal } from './lib/signal-resolution.ts';

async function seed() {
  console.log('Seeding mock signals directly into DB...');

  // Create 35 signals
  const created = [];
  for (let i = 0; i < 35; i++) {
    const isPick = Math.random() > 0.5;
    const sourceList = isPick ? DEMO_AI_PICKS : DEMO_STOCKS;
    const stock = sourceList[Math.floor(Math.random() * sourceList.length)];
    
    const currentPrice = stock.price;
    const signalType = Math.random() > 0.35 ? 'BUY' : 'SELL';
    
    const targetPct = 0.05 + Math.random() * 0.12;
    const slPct = 0.03 + Math.random() * 0.06;
    
    const targetPrice = signalType === 'BUY' 
      ? currentPrice * (1 + targetPct) 
      : currentPrice * (1 - targetPct);
      
    const slPrice = signalType === 'BUY'
      ? currentPrice * (1 - slPct)
      : currentPrice * (1 + slPct);
      
    const confidence = Math.floor(55 + Math.random() * 40);
    
    const models = [
      { name: 'XGBoost', signal: signalType, conf: confidence + Math.floor(Math.random() * 8 - 4) },
      { name: 'LightGBM', signal: signalType, conf: confidence + Math.floor(Math.random() * 8 - 4) },
      { name: 'Neural Net', signal: Math.random() > 0.7 ? (signalType === 'BUY' ? 'HOLD' : 'BUY') : signalType, conf: confidence - 8 },
    ];
    
    const rationale = `Generated technical pattern breakout detected. Volume surge above 20-day moving average indicating strong ${signalType.toLowerCase()} momentum.`;
    
    // Backdate issued_at by up to 40 days
    const backdateDays = Math.floor(Math.random() * 40);
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
        horizon_days: 5 + Math.floor(Math.random() * 15),
        rationale: rationale,
      }
    });
    created.push(signal);
  }

  console.log(`Created ${created.length} signals. Now resolving closed/expired ones...`);

  const currentDate = new Date();
  let resolvedCount = 0;

  for (const signal of created) {
    const daysOpen = Math.floor((currentDate.getTime() - signal.issued_at.getTime()) / (1000 * 60 * 60 * 24));
    
    // Simulate price movement based on days open
    let simulatedPrice = signal.entry_price;
    const roll = Math.random();
    
    if (roll < 0.45) {
      // Hit Target
      simulatedPrice = signal.signal_type === 'BUY' ? signal.target_price * 1.01 : signal.target_price * 0.99;
    } else if (roll < 0.70) {
      // Hit Stop Loss
      simulatedPrice = signal.signal_type === 'BUY' ? signal.stop_loss_price * 0.99 : signal.stop_loss_price * 1.01;
    } else if (daysOpen > signal.horizon_days) {
      // Expired
      simulatedPrice = signal.entry_price * (1 + (Math.random() * 0.1 - 0.05));
    }

    const res = evaluateSignal({
      signal_type: signal.signal_type,
      entry_price: signal.entry_price,
      target_price: signal.target_price,
      stop_loss_price: signal.stop_loss_price,
      issued_at: signal.issued_at,
      horizon_days: signal.horizon_days,
    }, simulatedPrice, currentDate);

    if (res.status !== 'OPEN') {
      await prisma.signal.update({
        where: { id: signal.id },
        data: {
          status: res.status,
          closed_at: res.closed_at,
          closed_price: res.closed_price,
          realized_pnl_pct: res.realized_pnl_pct,
        }
      });
      resolvedCount++;
    }
  }

  console.log(`Successfully resolved ${resolvedCount} signals.`);
}

seed()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
