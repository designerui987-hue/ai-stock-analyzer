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
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '1Y';
    
    const now = new Date();
    const period1 = new Date();
    
    let interval: '1d' | '1wk' | '1mo' = '1d';
    
    switch (period) {
      case '1M':
        period1.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        period1.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        period1.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        period1.setFullYear(now.getFullYear() - 1);
        break;
      case '5Y':
        period1.setFullYear(now.getFullYear() - 5);
        interval = '1wk';
        break;
      default:
        period1.setFullYear(now.getFullYear() - 1);
    }
    
    const querySymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    
    const result = await yahooFinance.historical(querySymbol, {
      period1: period1,
      period2: now,
      interval: interval
    });
    
    const data = result.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      timestamp: Math.floor(item.date.getTime() / 1000),
      open: item.open ? Number(item.open.toFixed(2)) : 0,
      high: item.high ? Number(item.high.toFixed(2)) : 0,
      low: item.low ? Number(item.low.toFixed(2)) : 0,
      close: item.close ? Number(item.close.toFixed(2)) : 0,
      volume: item.volume || 0
    }));
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching chart data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data', details: error.message },
      { status: 500 }
    );
  }
}
