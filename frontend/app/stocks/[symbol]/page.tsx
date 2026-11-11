'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Target,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Newspaper,
  Layers,
  Calculator,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  ShoppingBag,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { DEMO_STOCKS } from '@/lib/data';
import { auth } from '@/lib/api';
import { getOptionChainSummary } from '@/lib/optionChain';
import { calculatePositionSize } from '@/lib/positionSizing';
import { generateConsensusSummary } from '@/lib/explainability/extractFactors';
import { ModelVote } from '@/lib/explainability/factorMapping';

/**
 * Adapts backend AI analysis to the shape expected by the UI.
 *
 * IMPORTANT: prediction_models is NOT mapped — the backend no longer returns
 * fake XGBoost/LightGBM/Neural Net/Prophet scores (removed per AGENTS.md).
 * Rule-based factors from the deterministic engine are shown directly.
 */
function adaptBackendAIToFrontend(backendAI: any, technicals?: any) {
  if (!backendAI) return null;

  // RSI/MACD may be numbers OR {status:'unavailable'} objects from the backend
  const rsiRaw = backendAI.rsi ?? technicals?.rsi;
  const macdRaw = backendAI.macd ?? technicals?.macd;
  const rsiDisplay: number | null = typeof rsiRaw === 'number' ? rsiRaw : null;
  const macdDisplay: number | null = typeof macdRaw === 'number' ? macdRaw : null;

  return {
    signal: (backendAI.signal ?? 'HOLD') as string,
    confidence: (backendAI.confidence ?? 50) as number,
    risk: ((backendAI.risk_score ?? 5) < 4 ? 'Low' : (backendAI.risk_score ?? 5) < 7 ? 'Medium' : 'High') as string,
    riskScore: (backendAI.risk_score ?? 5) as number,
    entry: (backendAI.entry_price ?? 0) as number,
    target: (backendAI.exit_price ?? 0) as number,
    stopLoss: (backendAI.stop_loss ?? 0) as number,
    upside: (backendAI.profit_probability ?? 50) as number,
    profitProb: (backendAI.profit_probability ?? 50) as number,
    reasons: ([backendAI.explanation, ...(backendAI.factors || [])].filter(Boolean)) as string[],
    pe: (typeof backendAI.pe_ratio === 'number' ? backendAI.pe_ratio : null) as number | null,
    rsi: rsiDisplay,
    macd: macdDisplay,
    analysis_mode: (backendAI.analysis_mode ?? 'unknown') as string,
    // No model_votes — fake XGBoost/LightGBM/Neural Net/Prophet breakdown removed
    model_votes: [] as ModelVote[],
    consensus_summary: null as string | null,
  };
}

export default function StockAnalysisPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();
  const demoStock = DEMO_STOCKS.find((s) => s.symbol === symbol) || DEMO_STOCKS[0];
  const [liveStock, setLiveStock] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    let unsubscribeStream: (() => void) | undefined;
    import('@/lib/api').then(({ api }) => {
      // Fetch Analysis from backend (includes unified market data + AI-assisted quant analysis)
      api.getStockAnalysis(symbol)
        .then(data => {
          setLiveStock(data);
        })
        .catch(err => console.error(err));
        
      // Fetch Initial Chart Data
      fetchChartForRange('1M');

      // Subscribe to real-time price stream via SSE
      unsubscribeStream = api.subscribePriceStream([symbol], (event) => {
        if (event?.quotes && Array.isArray(event.quotes)) {
          const match = event.quotes.find((q: any) => q.symbol === symbol);
          if (match && typeof match.price === 'number' && match.price > 0) {
            setLiveStock((prev: any) => {
              if (!prev) return { quote: match };
              return {
                ...prev,
                quote: { ...(prev.quote || {}), ...match },
              };
            });
          }
        }
      });
    });

    return () => {
      if (unsubscribeStream) unsubscribeStream();
    };
  }, [symbol]);

  const fetchChartForRange = (range: string) => {
    import('@/lib/api').then(({ api }) => {
      api.getChartData(symbol, range)
        .then(data => {
          if (Array.isArray(data)) {
            const formatted = data.map(d => ({
              time: d.date,
              value: d.close
            }));
            setChartData(formatted);
          }
        })
        .catch(err => console.error(err));
    });
  };

  // Prefer live quote from backend or Next.js route; fall back to demo fixture only when DEMO_MODE is true
  const isDemoAllowed = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const resolvedQuote = liveStock?.quote?.price ? liveStock.quote : (liveStock?.live_quote?.price ? liveStock.live_quote : null);
  const stock = resolvedQuote ? { ...demoStock, ...resolvedQuote } : (isDemoAllowed ? demoStock : { ...demoStock, price: 0, change_pct: 0, is_unavailable: true });

  const riskData = liveStock?.risk;
  const isRiskOk = riskData?.status === 'ok';
  const betaVal = typeof riskData?.beta === 'number' ? riskData.beta.toFixed(2) : (riskData?.beta?.status === 'unavailable' ? 'Unavailable' : '—');
  const volVal = typeof riskData?.volatility_pct === 'number' ? `${riskData.volatility_pct.toFixed(1)}%` : (riskData?.volatility_pct?.status === 'unavailable' ? 'Unavailable' : '—');
  const ddVal = typeof riskData?.max_drawdown_pct === 'number' ? `${riskData.max_drawdown_pct.toFixed(1)}%` : (riskData?.max_drawdown_pct?.status === 'unavailable' ? 'Unavailable' : '—');
  const sharpeVal = typeof riskData?.sharpe_ratio === 'number' ? riskData.sharpe_ratio.toFixed(2) : (riskData?.sharpe_ratio?.status === 'unavailable' ? 'Unavailable' : '—');
  const riskSource = riskData?.source || 'yfinance/^NSEI';
  const riskAsOf = riskData?.as_of ? new Date(riskData.as_of).toLocaleDateString('en-IN') : null;
  const ai = (liveStock?.ai_analysis ? adaptBackendAIToFrontend(liveStock.ai_analysis, liveStock.technical) : null) || adaptBackendAIToFrontend({ signal: 'HOLD', confidence: 50, risk_score: 5, entry_price: stock.price, exit_price: stock.price, stop_loss: stock.price, profit_probability: 50, explanation: 'Loading AI Data...', factors: [], prediction_models: {} })!;
  
  const isUp = stock.change_pct >= 0;
  const [watchlisted, setWatchlisted] = useState(false);

  // Position Sizing Calculator State (defaults to 11,83,500 capital & 1% risk)
  const [calcCapital, setCalcCapital] = useState<number>(1183500);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.0);

  const sizingResult = calculatePositionSize({
    account_capital: calcCapital,
    risk_pct: calcRiskPct,
    entry_price: ai?.entry ?? stock.price,
    stop_loss_price: ai?.stopLoss ?? stock.price,
    target_price: ai?.target ?? stock.price,
    symbol: stock.symbol,
  });

  // State for expanding explainability model cards
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set(['XGBoost']));

  const toggleModelExpand = (name: string) => {
    const next = new Set(expandedModels);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedModels(next);
  };

  // Broker Connection & Order Placement Modal State
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderProductType, setOrderProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [liveOptIn, setLiveOptIn] = useState(false);

  useEffect(() => {
    fetch('/api/broker/connection', { headers: auth.getAuthHeaders() })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.connected) {
          setBrokerConnected(true);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleExecuteOrder = async () => {
    setOrderSubmitting(true);
    setOrderError(null);
    setOrderSuccessMsg(null);

    try {
      const res = await fetch('/api/broker/orders', {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({
          symbol: stock.symbol,
          transaction_type: ai.signal === 'BUY' ? 'BUY' : 'SELL',
          quantity: sizingResult.position_size_shares,
          order_type: orderType,
          product_type: orderProductType,
          stop_loss_price: ai.stopLoss,
          target_price: ai.target,
          user_confirmed: true,
          mode: orderMode,
          live_trading_opt_in: orderMode === 'LIVE' ? liveOptIn : false,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setOrderError(data.error || 'Order placement failed');
      } else {
        const msg = data.mode === 'PAPER'
          ? `📝 Paper Order #${data.order.broker_order_id} executed at ₹${data.order.price} (Simulation)`
          : `✅ Live Order #${data.order.broker_order_id} placed successfully with Zerodha Kite!`;
        setOrderSuccessMsg(msg);
        setTimeout(() => {
          setIsOrderModalOpen(false);
          setOrderSuccessMsg(null);
        }, 2000);
      }
    } catch (e: any) {
      setOrderError(e.message || 'Network error executing order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const CHART_DATA = chartData.length > 0 ? chartData : [
    { time: 'Loading...', value: stock.price }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header Card */}
      <Card size="large" className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100">
              {stock.symbol}
            </h1>
            <Badge variant={ai.signal.toLowerCase() as any} size="md">
              AI {ai.signal}
            </Badge>
            <FreshnessBadge
              status={stock.freshness || (stock.is_unavailable ? 'UNAVAILABLE' : 'DELAYED (15m)')}
              asOf={stock.as_of}
              source={stock.source}
              showDetails={true}
            />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {stock.name} · {stock.sector} · Market Cap: {stock.market_cap}
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-h1 font-semibold text-slate-900 dark:text-slate-100">
              ₹{stock.price.toLocaleString('en-IN')}
            </div>
            <div
              className={`text-caption font-medium mt-0.5 ${
                isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isUp ? '+' : ''}
              {stock.change_pct.toFixed(2)}% Today
            </div>
          </div>

          <Button
            variant={watchlisted ? 'secondary' : 'outline'}
            size="md"
            icon={<Bookmark className={`w-4 h-4 ${watchlisted ? 'fill-current' : ''}`} />}
            onClick={() => setWatchlisted(!watchlisted)}
          >
            {watchlisted ? 'Watchlisted' : 'Add to Watchlist'}
          </Button>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.08] pt-2 pb-3">
          <Link
            href={`/stocks/${stock.symbol}`}
            className="px-4 py-2 rounded-btn text-xs font-semibold bg-indigo-600 text-white shadow-subtle"
          >
            Overview & Technicals
          </Link>
          <Link
            href={`/stocks/${stock.symbol}/options`}
            className="px-4 py-2 rounded-btn text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" /> Options Chain & F&O
          </Link>
        </div>
      </Card>

      {/* Ticker Quick Navigation Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'ITC', 'ZOMATO'].map((sym) => (
          <Link
            key={sym}
            href={`/stocks/${sym}`}
            className={`px-3 py-1.5 rounded-btn text-xs font-medium shrink-0 transition-colors ${
              sym === symbol
                ? 'bg-indigo-600 text-white shadow-subtle'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {sym}
          </Link>
        ))}
      </div>

      {/* Main Grid: Financial Chart & AI Recommendation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Financial Chart & Fundamental Metrics */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Financial Chart Container */}
          <Card size="large" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Technical Price Structure & Moving Averages
              </h3>
              <Badge variant="indigo" size="sm">
                RSI: {ai.rsi !== null ? `${ai.rsi}` : 'N/A'} (yfinance)
              </Badge>
            </div>

            <FinancialChart data={CHART_DATA} height={340} isPositive={isUp} showTimeRange={true} onRangeChange={fetchChartForRange} />
          </Card>

          {/* Financial Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <span className="text-caption text-slate-500 font-medium">P/E Ratio</span>
              <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-2">
                {ai.pe !== null ? `${ai.pe}x` : <span className="text-xs text-slate-400">N/A</span>}
              </p>
              <span className="text-caption text-slate-400">Trailing P/E · yfinance</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">RSI (14-Day)</span>
              <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-2">
                {ai.rsi !== null ? ai.rsi : <span className="text-xs text-slate-400">N/A</span>}
              </p>
              <span className="text-caption text-slate-400">Source: yfinance</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">MACD (12, 26)</span>
              <p className="text-h3 font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
                {ai.macd !== null ? (ai.macd >= 0 ? `+${ai.macd}` : `${ai.macd}`) : <span className="text-xs text-slate-400">N/A</span>}
              </p>
              <span className="text-caption text-slate-400">Source: yfinance</span>
            </Card>

            <Card>
              <span className="text-caption text-slate-500 font-medium">Analysis Mode</span>
              <p className="text-h3 font-semibold text-indigo-600 dark:text-indigo-400 mt-2 text-xs leading-tight">
                {ai.analysis_mode === 'deterministic_rule_based' ? 'Rule-Based' : (ai.analysis_mode ?? 'Unknown')}
              </p>
              <span className="text-caption text-slate-400">Not investment advice</span>
            </Card>
          </div>

          {/* Institutional Risk Metrics (Real Beta, Volatility, Max DD, Sharpe vs ^NSEI) */}
          <Card size="large" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Institutional Risk Metrics (1Y vs ^NSEI)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Source: {riskSource} {riskAsOf ? `· As of ${riskAsOf}` : ''} · Not investment advice
                </p>
              </div>
              <Badge variant={isRiskOk ? 'indigo' : 'amber'} size="sm">
                {isRiskOk ? 'Live 1Y Quant' : (riskData?.status === 'unavailable' ? 'Unavailable' : 'Calculating...')}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
                <span className="text-caption text-slate-500 font-medium">Beta vs ^NSEI</span>
                <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {betaVal}
                </p>
                <span className="text-[10px] text-slate-400">Covariance / NSEI var</span>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
                <span className="text-caption text-slate-500 font-medium">Annualised Volatility</span>
                <p className="text-h3 font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {volVal}
                </p>
                <span className="text-[10px] text-slate-400">252-day daily StDev</span>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
                <span className="text-caption text-slate-500 font-medium">Max Drawdown</span>
                <p className="text-h3 font-semibold text-red-600 dark:text-red-400 mt-1">
                  {ddVal}
                </p>
                <span className="text-[10px] text-slate-400">Peak-to-Trough 1Y</span>
              </div>

              <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06]">
                <span className="text-caption text-slate-500 font-medium">Sharpe Ratio</span>
                <p className="text-h3 font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                  {sharpeVal}
                </p>
                <span className="text-[10px] text-slate-400">Annualised (Rf = 6.5%)</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: AI Decision Panel & Action Plan */}
        <div className="space-y-6">
          {/* Main AI Decision Card */}
          <Card size="large" className="space-y-6 border-indigo-500/30">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-4">
              <div>
                <p className="text-caption text-slate-500 uppercase tracking-wider font-medium">
                  Ensemble AI Signal
                </p>
                <div className="flex items-baseline space-x-3 mt-1">
                  <span
                    className={`text-display font-semibold ${
                      ai.signal === 'BUY'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : ai.signal === 'SELL'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {ai.signal}
                  </span>
                  <Badge variant={ai.signal.toLowerCase() as any} size="md">
                    {ai.confidence}% Confidence
                  </Badge>
                </div>
                {/* Integrated Options Positioning Tag */}
                <div className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded inline-flex items-center gap-1.5 border border-indigo-500/20">
                  <Layers className="w-3 h-3" />
                  <span>
                    Options positioning: {getOptionChainSummary(stock.symbol, stock.price).summary.pcr_signal} (PCR {getOptionChainSummary(stock.symbol, stock.price).summary.pcr}, Max Pain ₹{getOptionChainSummary(stock.symbol, stock.price).summary.max_pain})
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-caption text-slate-500">Risk Assessment</span>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {ai.risk} ({ai.riskScore}/10)
                </p>
              </div>
            </div>

            {/* Disclaimer per AGENTS.md Rule 7 */}
            <div className="text-[11px] text-amber-600/90 dark:text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded p-2 text-center">
              ⚠️ Not investment advice. Real-time data from {stock.source || 'exchange'} as of {stock.as_of ? new Date(stock.as_of).toLocaleTimeString('en-IN') : 'market hours'}.
            </div>

            {/* Action Plan Grid */}
            <div className="space-y-2">
              <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
                Action Plan & Target Levels
              </span>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06] text-center">
                  <span className="text-caption text-slate-500">Entry</span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    ₹{ai.entry}
                  </p>
                </div>

                <div className="p-3 rounded-btn bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-caption text-emerald-600 dark:text-emerald-400">
                    Target
                  </span>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    ₹{ai.target}
                  </p>
                </div>

                <div className="p-3 rounded-btn bg-red-500/10 border border-red-500/20 text-center">
                  <span className="text-caption text-red-600 dark:text-red-400">Stop Loss</span>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-1">
                    ₹{ai.stopLoss}
                  </p>
                </div>
              </div>
            </div>

            {/* Position Size Calculator Card */}
            <div className="p-4 rounded-card bg-slate-50/80 dark:bg-slate-900/70 border border-indigo-500/20 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-2.5">
                <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-wider">
                  <Calculator className="w-4 h-4" />
                  <span>Position Size Calculator</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">1% Risk Rule Engine</span>
              </div>

              {/* Inline Editable Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Trading Capital (₹)</label>
                  <input
                    type="number"
                    value={calcCapital}
                    onChange={(e) => setCalcCapital(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Risk / Trade (%)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={calcRiskPct}
                    onChange={(e) => setCalcRiskPct(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Calculation Output Results */}
              {sizingResult.error ? (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{sizingResult.error}</span>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-white dark:bg-slate-800/80 rounded border border-slate-200 dark:border-white/[0.05]">
                    <div>
                      <span className="text-[10px] text-slate-500">Rec. Quantity</span>
                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400" suppressHydrationWarning>
                        {sizingResult.position_size_shares.toLocaleString()} Shares
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ({sizingResult.position_size_lots} Lots · {sizingResult.lot_size}/lot)
                        </span>
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500">Max Risk Amount</span>
                      <p className="text-sm font-bold text-red-600 dark:text-red-400" suppressHydrationWarning>
                        ₹{sizingResult.max_risk_amount.toLocaleString()}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          (₹{sizingResult.risk_per_share}/share)
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-500">Risk:Reward Ratio:</span>
                      <span
                        className={`font-bold ${
                          sizingResult.rr_quality === 'EXCELLENT'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sizingResult.rr_quality === 'GOOD'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        1 : {sizingResult.risk_reward_ratio}
                      </span>
                      <Badge
                        variant={
                          sizingResult.rr_quality === 'EXCELLENT'
                            ? 'emerald'
                            : sizingResult.rr_quality === 'GOOD'
                            ? 'amber'
                            : 'red'
                        }
                        size="sm"
                      >
                        {sizingResult.rr_quality === 'EXCELLENT'
                          ? 'Favorable (≥1:2)'
                          : sizingResult.rr_quality === 'GOOD'
                          ? 'Acceptable'
                          : 'Poor R:R'}
                      </Badge>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500">Portfolio Value:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-1">
                        {sizingResult.position_value_pct}%
                      </span>
                    </div>
                  </div>

                  {sizingResult.is_concentration_breached && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-700 dark:text-amber-300 font-medium" suppressHydrationWarning>
                      ⚠️ Position value (₹{sizingResult.position_value.toLocaleString()}) exceeds max concentration limit ({sizingResult.max_concentration_pct}% of capital).
                    </div>
                  )}

                  {/* Broker Order Placement Trigger Button */}
                  <div className="pt-2 space-y-2">
                    <Button
                      variant={ai.signal === 'BUY' ? 'primary' : 'secondary'}
                      size="md"
                      onClick={() => setIsOrderModalOpen(true)}
                      className={`w-full justify-center text-xs font-semibold ${
                        ai.signal === 'BUY' ? '!bg-emerald-600 hover:!bg-emerald-700' : '!bg-red-600 hover:!bg-red-700 !text-white'
                      }`}
                    >
                      ⚡ Execute {ai.signal} Strategy on Upstox / Kite / Angel One ({sizingResult.position_size_shares} Shares)
                    </Button>
                    <p className="text-[10px] text-center text-slate-500 font-medium">
                      🎯 Optimized live trade parameters for Upstox, Zerodha Kite & Angel One
                    </p>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                    Formula: <code>floor(Risk ₹ / Risk-per-share ₹)</code> · Verify F&O lot sizes with broker.
                  </div>
                </div>
              )}
            </div>

            {/* Order Confirmation Modal */}
            {isOrderModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] pb-3">
                    <div className="flex items-center space-x-2">
                      <ShoppingBag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Confirm Broker Order Placement
                      </h3>
                    </div>
                    <button
                      onClick={() => setIsOrderModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Order Summary Grid */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-card border border-slate-200/60 dark:border-white/[0.05] text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Symbol</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{stock.symbol}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Transaction</span>
                      <Badge variant={ai.signal === 'BUY' ? 'emerald' : 'red'} size="sm">
                        {ai.signal}
                      </Badge>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Quantity</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        {sizingResult.position_size_shares} Shares ({sizingResult.position_size_lots} Lots)
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Estimated Price</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        ₹{ai.entry.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Est. Position Value</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        ₹{sizingResult.position_value.toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Calculated Risk</span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        ₹{sizingResult.max_risk_amount.toLocaleString()} ({calcRiskPct}%)
                      </span>
                    </div>
                  </div>

                  {/* Execution Mode Selector (Paper vs Live) */}
                  <div className="space-y-2">
                    <label className="text-slate-500 font-medium block text-xs">
                      Trading Mode:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setOrderMode('PAPER'); setLiveOptIn(false); }}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          orderMode === 'PAPER'
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-600'
                            : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">📝 Paper Trading</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-medium">Default</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Real-time simulation, zero financial risk</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderMode('LIVE')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          orderMode === 'LIVE'
                            ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-1 ring-amber-600'
                            : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">⚡ Live Kite Trading</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-medium">Opt-in</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Routes to Zerodha Kite with real capital</p>
                      </button>
                    </div>

                    {orderMode === 'LIVE' && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                        <label className="flex items-start space-x-2 cursor-pointer text-xs text-amber-900 dark:text-amber-200">
                          <input
                            type="checkbox"
                            checked={liveOptIn}
                            onChange={(e) => setLiveOptIn(e.target.checked)}
                            className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-medium text-[11px] leading-tight">
                            I explicitly opt in to Live Trading. I understand real market orders will be submitted to Zerodha Kite and capital will be at risk.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Product & Order Type Selectors */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-slate-500 font-medium block mb-1">
                        Product Type (Execution):
                      </label>
                      <select
                        value={orderProductType}
                        onChange={(e) => setOrderProductType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="CNC">CNC (Equity Cash Delivery)</option>
                        <option value="MIS">MIS (Intraday Leverage)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-500 font-medium block mb-1">
                        Order Type:
                      </label>
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="MARKET">MARKET Order</option>
                        <option value="LIMIT">LIMIT Order (₹{ai.entry})</option>
                      </select>
                    </div>
                  </div>

                  {/* Warning & SEBI Disclaimer */}
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-card text-[11px] text-indigo-900 dark:text-indigo-200 leading-normal space-y-1">
                    <p className="font-bold">🎯 Live Broker Trade Parameters:</p>
                    <p>
                      Use these AI-computed Entry (₹{ai.entry}), Target (₹{ai.target}), and Stop Loss (₹{ai.stopLoss}) parameters when placing your trade orders on Upstox, Zerodha Kite, or Angel One.
                    </p>
                  </div>

                  {/* Error / Success Feedback */}
                  {orderError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400 font-medium">
                      ❌ {orderError}
                    </div>
                  )}

                  {orderSuccessMsg && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      {orderSuccessMsg}
                    </div>
                  )}

                  {/* Modal Action Buttons */}
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setIsOrderModalOpen(false)}
                      disabled={orderSubmitting}
                    >
                      Cancel
                    </Button>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleExecuteOrder}
                      disabled={orderSubmitting || (orderMode === 'LIVE' && !liveOptIn)}
                      className={ai.signal === 'BUY' ? '!bg-emerald-600 hover:!bg-emerald-700' : '!bg-red-600 hover:!bg-red-700'}
                    >
                      {orderSubmitting
                        ? 'Executing Order...'
                        : orderMode === 'PAPER'
                        ? `Confirm & Place Paper ${ai.signal}`
                        : `Confirm & Place Live Kite ${ai.signal}`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Key Catalysts & Reasons */}
            <div className="space-y-3">
              <span className="text-caption text-slate-500 font-medium uppercase tracking-wider">
                Key AI Catalysts
              </span>
              <div className="space-y-2">
                {ai.reasons.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Rule-based analysis factors (AI model breakdown removed — no trained ML models exist) */}
          {ai.reasons.length > 1 && (
            <Card className="space-y-4 border-indigo-500/30">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-white/[0.06] pb-3">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Quantitative Analysis Factors
                </h3>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded">
                  Rule-based · {ai.analysis_mode === 'deterministic_rule_based' ? 'No AI model' : ai.analysis_mode}
                </span>
              </div>
              <div className="space-y-2">
                {ai.reasons.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start space-x-2 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                ⚠️ Not investment advice. Set NVIDIA_API_KEY for full LLM-assisted analysis.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
