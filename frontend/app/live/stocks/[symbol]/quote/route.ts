import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toUpperCase();
    const querySymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    
    const quote = await yahooFinance.quote(querySymbol);
    
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    
    const data = {
      symbol: symbol,
      name: quote.longName || quote.shortName || symbol,
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      change_pct: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      market_cap: quote.marketCap ? formatMarketCap(quote.marketCap) : 'N/A',
      currency: quote.currency,
      exchange: quote.exchange
    };
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching quote data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data', details: error.message },
      { status: 500 }
    );
  }
}

function formatMarketCap(value: number): string {
  const inCrores = value / 10000000;
  if (inCrores >= 100000) {
    return `${(inCrores / 100000).toFixed(2)}L Cr`; // Lakh Crores
  } else if (inCrores >= 1) {
    return `${inCrores.toFixed(2)} Cr`;
  }
  return value.toLocaleString();
}
