// Demo data for client-side rendering when backend is not available

export const DEMO_INDICES = [
  { symbol: 'NIFTY50',   value: 22456.80, change: 112.35, change_pct: 0.50 },
  { symbol: 'SENSEX',   value: 73987.45, change: 378.90, change_pct: 0.51 },
  { symbol: 'BANKNIFTY',value: 47234.60, change: 234.15, change_pct: 0.50 },
  { symbol: 'NIFTYIT',  value: 35678.90, change: 156.45, change_pct: 0.44 },
];

export const DEMO_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2487.35, change_pct: 0.05, sector: 'Oil & Gas', market_cap: '16.82L Cr', volume: 12453678 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3892.50, change_pct: -0.60, sector: 'IT', market_cap: '14.21L Cr', volume: 3456789 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1645.80, change_pct: 0.75, sector: 'Banking', market_cap: '12.54L Cr', volume: 8976543 },
  { symbol: 'INFY', name: 'Infosys', price: 1567.25, change_pct: 0.56, sector: 'IT', market_cap: '6.50L Cr', volume: 6543210 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1089.45, change_pct: 0.52, sector: 'Banking', market_cap: '7.63L Cr', volume: 7654321 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', price: 1178.90, change_pct: 1.94, sector: 'Telecom', market_cap: '6.92L Cr', volume: 5678901 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 756.30, change_pct: -0.50, sector: 'Banking', market_cap: '6.75L Cr', volume: 15678901 },
  { symbol: 'ITC', name: 'ITC Ltd', price: 438.60, change_pct: 0.49, sector: 'FMCG', market_cap: '5.47L Cr', volume: 11234567 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', price: 892.15, change_pct: 2.14, sector: 'Auto', market_cap: '3.29L Cr', volume: 12345678 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', price: 467.80, change_pct: 1.38, sector: 'IT', market_cap: '2.44L Cr', volume: 8901234 },
  { symbol: 'LT', name: 'Larsen & Toubro', price: 3245.60, change_pct: 0.90, sector: 'Infrastructure', market_cap: '4.46L Cr', volume: 2345678 },
  { symbol: 'TATASTEEL', name: 'Tata Steel', price: 145.80, change_pct: 2.28, sector: 'Metals', market_cap: '1.78L Cr', volume: 25678901 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', price: 1234.50, change_pct: -0.37, sector: 'Pharma', market_cap: '2.96L Cr', volume: 3456789 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', price: 2876.40, change_pct: 1.62, sector: 'Metals & Mining', market_cap: '3.28L Cr', volume: 4567890 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', price: 7234.80, change_pct: 0.79, sector: 'NBFC', market_cap: '4.48L Cr', volume: 2345678 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1834.55, change_pct: -0.48, sector: 'Banking', market_cap: '3.64L Cr', volume: 4567890 },
  { symbol: 'HCLTECH', name: 'HCL Technologies', price: 1456.30, change_pct: 0.78, sector: 'IT', market_cap: '3.95L Cr', volume: 3456789 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 10876.45, change_pct: -1.14, sector: 'Auto', market_cap: '3.38L Cr', volume: 876543 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', price: 2534.70, change_pct: -0.60, sector: 'FMCG', market_cap: '5.95L Cr', volume: 2345678 },
  { symbol: 'TECHM', name: 'Tech Mahindra', price: 1289.45, change_pct: -0.60, sector: 'IT', market_cap: '1.26L Cr', volume: 3456789 },
];

export const DEMO_AI_PICKS = [
  { symbol: 'TATAMOTORS', name: 'Tata Motors', price: 892.15, change_pct: 2.14, signal: 'BUY', confidence: 87.2, risk_score: 4.5, sector: 'Auto', reason: 'JLR record volumes + EV momentum breakout' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', price: 1178.90, change_pct: 1.94, signal: 'BUY', confidence: 82.1, risk_score: 3.8, sector: 'Telecom', reason: 'Subscriber growth + ARPU expansion trend' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2487.35, change_pct: 0.05, signal: 'BUY', confidence: 78.5, risk_score: 3.2, sector: 'Oil & Gas', reason: 'Strong earnings + green energy catalyst' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1645.80, change_pct: 0.75, signal: 'BUY', confidence: 76.3, risk_score: 2.9, sector: 'Banking', reason: 'NIM expansion + FII buying detected' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 10876.45, change_pct: -1.14, signal: 'SELL', confidence: 71.8, risk_score: 6.2, sector: 'Auto', reason: 'RSI overbought + fading momentum signals' },
  { symbol: 'TECHM', name: 'Tech Mahindra', price: 1289.45, change_pct: -0.60, signal: 'HOLD', confidence: 65.4, risk_score: 5.1, sector: 'IT', reason: 'Consolidation phase — wait for breakout' },
];

export const DEMO_PORTFOLIO = {
  total_invested: 1183500.00,
  current_value: 1311875.00,
  total_pnl: 128375.00,
  total_pnl_pct: 10.85,
  day_pnl: 4562.00,
  day_pnl_pct: 0.35,
  holdings_count: 6,
  holdings: [
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel', qty: 60, avg_price: 980.00, current_price: 1178.90, invested: 58800, current_value: 70734, pnl: 11934, pnl_pct: 20.30, sector: 'Telecom' },
    { symbol: 'INFY', name: 'Infosys', qty: 75, avg_price: 1420.00, current_price: 1567.25, invested: 106500, current_value: 117543.75, pnl: 11043.75, pnl_pct: 10.37, sector: 'IT' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', qty: 25, avg_price: 3650.00, current_price: 3892.50, invested: 91250, current_value: 97312.5, pnl: 6062.5, pnl_pct: 6.64, sector: 'IT' },
    { symbol: 'ITC', name: 'ITC Ltd', qty: 200, avg_price: 410.00, current_price: 438.60, invested: 82000, current_value: 87720, pnl: 5720, pnl_pct: 6.98, sector: 'FMCG' },
    { symbol: 'RELIANCE', name: 'Reliance Industries', qty: 50, avg_price: 2350.00, current_price: 2487.35, invested: 117500, current_value: 124367.5, pnl: 6867.5, pnl_pct: 5.85, sector: 'Oil & Gas' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', qty: 100, avg_price: 1580.00, current_price: 1645.80, invested: 158000, current_value: 164580, pnl: 6580, pnl_pct: 4.16, sector: 'Banking' },
  ],
  sector_allocation: { 'IT': 32.5, 'Banking': 24.9, 'Oil & Gas': 18.8, 'Telecom': 10.7, 'FMCG': 13.1 },
  top_performer: 'BHARTIARTL',
  worst_performer: 'HDFCBANK',
};

export const DEMO_ALERTS = [
  { id: '1', type: 'buy_signal', priority: 'high', symbol: 'TATAMOTORS', title: 'BUY Signal: Tata Motors', message: 'AI detected strong buying opportunity at ₹892.15. Confidence: 87%. Target: ₹1,024.', time: '2 min ago', read: false },
  { id: '2', type: 'breakout', priority: 'high', symbol: 'BHARTIARTL', title: 'Breakout Alert: Bharti Airtel', message: 'Breaking above resistance at ₹1,178. Volume surge 180% above average.', time: '15 min ago', read: false },
  { id: '3', type: 'sell_signal', priority: 'medium', symbol: 'MARUTI', title: 'SELL Signal: Maruti Suzuki', message: 'AI recommends booking profits at ₹10,876. Risk score elevated to 6.2/10.', time: '32 min ago', read: true },
  { id: '4', type: 'risk_alert', priority: 'medium', symbol: 'ADANIENT', title: 'Risk Warning: Adani Enterprises', message: 'Increased volatility detected. Risk score: 7.8/10. Tighten stop-loss.', time: '1 hour ago', read: true },
  { id: '5', type: 'buy_signal', priority: 'low', symbol: 'TATASTEEL', title: 'BUY Signal: Tata Steel', message: 'Metals sector momentum building. Entry at ₹145. Target: ₹175.', time: '2 hours ago', read: true },
];

export const DEMO_INSIGHTS = [
  { id: '1', title: 'IT Sector Momentum Building', summary: 'AI models detect increasing institutional buying in IT stocks. TCS, Infosys, and HCL Tech show bullish technical patterns.', category: 'sector_rotation', impact: 'positive', symbols: ['TCS', 'INFY', 'HCLTECH'], confidence: 78.5, time: '1 hour ago' },
  { id: '2', title: 'Banking Sector: Rate Cut Tailwind', summary: 'Anticipated RBI rate cut could benefit banking stocks. HDFC Bank and ICICI Bank positioned to gain.', category: 'macro_event', impact: 'positive', symbols: ['HDFCBANK', 'ICICIBANK', 'SBIN'], confidence: 72.3, time: '2 hours ago' },
  { id: '3', title: 'Auto Sector: Festive Season Boost', summary: 'October auto sales data shows 12% YoY growth. Tata Motors and Maruti expected to report strong results.', category: 'fundamental', impact: 'positive', symbols: ['TATAMOTORS', 'MARUTI'], confidence: 81.2, time: '3 hours ago' },
  { id: '4', title: 'Volatility Warning: Global Uncertainty', summary: 'AI market regime detector flags increasing global uncertainty. VIX rising suggests potential correction.', category: 'risk_alert', impact: 'negative', symbols: [], confidence: 65.8, time: '4 hours ago' },
  { id: '5', title: 'Reliance: Green Energy Play', summary: '₹75,000 crore investment in green energy signals long-term growth catalyst.', category: 'fundamental', impact: 'positive', symbols: ['RELIANCE'], confidence: 74.1, time: '5 hours ago' },
];

export function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
