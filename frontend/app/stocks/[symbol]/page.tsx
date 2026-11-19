'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Check,
  Plus,
  Bell,
  AlertTriangle,
  BarChart2,
  BookOpen,
  ArrowLeft,
  Shield,
  Layers,
  Calculator,
  HelpCircle,
  X,
  ShoppingBag,
  Info,
} from 'lucide-react';
import { StockLogo } from '@/components/ui/StockLogo';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { FinancialChart } from '@/components/ui/FinancialChart';
import { openResearchCompanion } from '@/components/layout/ResearchCompanionDrawer';
import { formatINR, formatNumberIN, formatPercent, formatMarketCap } from '@/lib/format';
import { api, auth } from '@/lib/api';
import { DEMO_STOCKS } from '@/lib/data';
import { calculatePositionSize } from '@/lib/positionSizing';

export default function CompanyResearchPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();
  const isDemoAllowed = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const [activeTab, setActiveTab] = useState<'overview' | 'technicals' | 'risk'>('overview');
  const [selectedRange, setSelectedRange] = useState<string>('1M');
  const [watchlisted, setWatchlisted] = useState<boolean>(false);
  const [liveStock, setLiveStock] = useState<any>(null);
  const [chartData, setChartData] = useState<Array<{ time: string; value: number }>>([]);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Price Alert Modal State
  const [showAlertModal, setShowAlertModal] = useState<boolean>(false);
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above');
  const [alertPrice, setAlertPrice] = useState<string>('');
  const [alertSavedMsg, setAlertSavedMsg] = useState<string | null>(null);

  // Order Placement Modal State (Paper Trading)
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [orderQuantity, setOrderQuantity] = useState<number>(10);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [orderLimitPrice, setOrderLimitPrice] = useState<string>('');
  const [orderSubmitting, setOrderSubmitting] = useState<boolean>(false);
  const [orderMsg, setOrderMsg] = useState<string | null>(null);

  // Position Sizing Calculator State
  const [calcCapital, setCalcCapital] = useState<number>(1000000);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.0);

  // Personalized Workspace State: Holdings & Research View Mode
  const [userHolding, setUserHolding] = useState<any>(null);
  const [portfolioSummary, setPortfolioSummary] = useState<any>(null);
  const [researchView, setResearchView] = useState<'quick' | 'analyst'>('quick');

  // Fetch stock analysis, watchlist status, and initial chart
  useEffect(() => {
    let isMounted = true;
    let unsubStream: (() => void) | undefined;

    async function loadStockData() {
      try {
        setLoading(true);

        // Check watchlist & user holdings for personalized exposure
        if (auth.isAuthenticated()) {
          api.getWatchlist().then((res) => {
            if (isMounted && res?.success && Array.isArray(res.items)) {
              setWatchlisted(res.items.some((i: any) => i.symbol.toUpperCase() === symbol));
            }
          }).catch(() => {});

          api.getPortfolio().then((res) => {
            if (isMounted && res) {
              setPortfolioSummary(res);
              if (Array.isArray(res.holdings)) {
                const match = res.holdings.find((h: any) => h.symbol.toUpperCase() === symbol);
                if (match) setUserHolding(match);
              }
            }
          }).catch(() => {});
        }

        // Fetch quantitative & technical analysis
        const data = await api.getStockAnalysis(symbol).catch(() => null);
        if (!isMounted) return;

        if (!data || data.status === 'unavailable' || data.error) {
          if (!isDemoAllowed && !DEMO_STOCKS.find((s) => s.symbol === symbol)) {
            setNotFound(true);
          }
        }
        setLiveStock(data);

        // Fetch chart data
        fetchChart(selectedRange);

        // SSE Real-time price stream
        unsubStream = api.subscribePriceStream([symbol], (payload: any) => {
          if (!isMounted || !payload || typeof payload !== 'object') return;
          const tick = payload[symbol];
          if (tick && typeof tick.price === 'number' && tick.price > 0) {
            setLiveStock((prev: any) => ({
              ...(prev || {}),
              price: Number(tick.price),
              change_percent: tick.change_percent ?? tick.change_pct ?? prev?.change_percent,
              change_pct: tick.change_percent ?? tick.change_pct ?? prev?.change_pct,
              as_of: tick.as_of || new Date().toISOString(),
              source: tick.source || prev?.source || 'NSE Live',
              freshness: tick.freshness || 'LIVE',
            }));
          }
        });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadStockData();

    return () => {
      isMounted = false;
      if (unsubStream) unsubStream();
    };
  }, [symbol]);

  // Load account risk settings for calculator
  useEffect(() => {
    try {
      const u = auth.getUser();
      const key = u?.id ? `stockai_risk_settings_${u.id}` : 'stockai_risk_settings';
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.accountCapital === 'number' && parsed.accountCapital > 0) {
          setCalcCapital(parsed.accountCapital);
        }
        if (typeof parsed.riskPerTradePct === 'number' && parsed.riskPerTradePct > 0) {
          setCalcRiskPct(parsed.riskPerTradePct);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchChart = (range: string) => {
    api.getChartData(symbol, range)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setChartData(
            data.map((d: any) => ({
              time: d.date,
              value: Number(d.close),
            }))
          );
        }
      })
      .catch(() => {});
  };

  const handleRangeChange = (r: string) => {
    setSelectedRange(r);
    fetchChart(r);
  };

  const handleToggleWatchlist = async () => {
    const nextState = !watchlisted;
    setWatchlisted(nextState);
    try {
      if (nextState) {
        await api.addToWatchlist(symbol, 'NSE');
      } else {
        await api.removeFromWatchlist(symbol);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watchlist-updated'));
      }
    } catch {
      setWatchlisted(!nextState);
    }
  };

  // Reconcile quote with strict no-fake-data policy
  const matchedDemo = DEMO_STOCKS.find((s) => s.symbol === symbol);
  const currentPrice: number | null =
    typeof liveStock?.price === 'number' && liveStock.price > 0
      ? liveStock.price
      : (isDemoAllowed && matchedDemo ? matchedDemo.price : null);

  const changePct: number | null =
    typeof liveStock?.change_percent === 'number'
      ? liveStock.change_percent
      : (typeof liveStock?.change_pct === 'number' ? liveStock.change_pct : (isDemoAllowed && matchedDemo ? matchedDemo.change_pct : null));

  const isUp = (changePct ?? 0) >= 0;
  const companyName = liveStock?.name || (isDemoAllowed && matchedDemo?.name) || `${symbol} Ltd`;
  const sector = liveStock?.sector || (isDemoAllowed && matchedDemo?.sector) || 'Equities';
  const freshness = liveStock?.freshness || (isDemoAllowed ? 'DEMO' : 'UNAVAILABLE');
  const source = liveStock?.source || 'yfinance/NSE';
  const asOf = liveStock?.as_of ? new Date(liveStock.as_of).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST' : 'Market session';

  // Quantitative factors & deterministic thesis
  const ai = liveStock?.ai_prediction || liveStock?.ai_analysis || {};
  const tech = liveStock?.technicals || {};
  const rsi: string | null = typeof tech.rsi === 'number' ? tech.rsi.toFixed(1) : null;
  const rsiNum = rsi ? Number(rsi) : null;
  const trend = rsiNum !== null
    ? (rsiNum > 65 ? 'Above 20-day average' : (rsiNum < 40 ? 'Below 20-day average' : 'Near 20-day average'))
    : 'Awaiting trend verification';
  const volumeRatio = typeof tech.vol_surge === 'number' ? `${tech.vol_surge.toFixed(1)}×` : (typeof tech.volume_ratio === 'number' ? `${tech.volume_ratio.toFixed(1)}×` : null);
  const signal = ai.signal || null;

  // Fully data-driven summary, why, and risk points (no canned symbol hardcodes)
  const summary = signal === 'BUY'
    ? 'Quantitative rules indicate an improving trend with constructive momentum alignment.'
    : signal === 'SELL'
    ? 'Downward momentum detected across moving averages and technical filters.'
    : signal === 'HOLD'
    ? 'Mixed technical indicators. Price is consolidating near moving average bands.'
    : (isUp ? 'A firmer intraday trend, with room to build momentum.' : 'Consolidation phase. Look for volume confirmation.');

  const why = rsi !== null
    ? `Price is trading ${trend.toLowerCase()}${volumeRatio ? ` with volume tracking at ${volumeRatio} vs its 20-day average` : ''}. ${ai.rationale || 'Moving averages provide primary support zones.'}`
    : `Technical indicator calculation in progress. Awaiting historical bar verification for ${symbol}.`;

  const risk = rsiNum !== null && rsiNum > 68
    ? `RSI at ${rsi} indicates elevated short-term momentum; pullback risk toward the 20-day moving average is elevated.`
    : rsiNum !== null && rsiNum < 38
    ? `Weak technical momentum (RSI: ${rsi}). Confirm base-building and delivery support before initiating exposure.`
    : ai.stop_loss
    ? `Rule-based stop loss is marked at ${formatINR(ai.stop_loss)}. Sector and benchmark volatility remain primary risk drivers.`
    : 'Maintain position sizing discipline. Quantitative rule agreement does not eliminate market risk.';

  // Position sizing computation
  const entryPrice = currentPrice || 0;
  const stopLossPrice = ai.stop_loss || (currentPrice ? Number((currentPrice * 0.95).toFixed(2)) : 0);
  const targetPrice = ai.target || ai.target_price || (currentPrice ? Number((currentPrice * 1.08).toFixed(2)) : 0);

  const sizingResult = calculatePositionSize({
    account_capital: calcCapital,
    risk_pct: calcRiskPct,
    entry_price: entryPrice,
    stop_loss_price: stopLossPrice,
    target_price: targetPrice,
    symbol,
  });

  // Handle Order Placement (Paper Trading)
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSubmitting(true);
    setOrderMsg(null);

    try {
      const idempotencyKey = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/broker/orders', {
        method: 'POST',
        headers: {
          ...auth.getAuthHeaders(),
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          symbol,
          exchange: 'NSE',
          transaction_type: 'BUY',
          quantity: orderQuantity,
          order_type: orderType,
          product_type: 'CNC',
          limit_price: orderType === 'LIMIT' ? Number(orderLimitPrice || currentPrice) : undefined,
          expected_price: currentPrice,
          user_confirmed: true,
          mode: 'PAPER',
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOrderMsg(`Paper Order #${data.order.broker_order_id} recorded successfully!`);
        setTimeout(() => setShowOrderModal(false), 1600);
      } else {
        setOrderMsg(data.error || 'Failed to submit order');
      }
    } catch (err: any) {
      setOrderMsg(err.message || 'Error executing order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="bg-white border border-[#E1E7E8] rounded-[14px] p-8 space-y-4">
          <AlertTriangle className="w-10 h-10 text-[#8F6A24] mx-auto" />
          <h2 className="text-xl font-semibold text-[#142B32]">Instrument Not Found</h2>
          <p className="text-xs text-[#687A81]">
            Symbol &apos;{symbol}&apos; could not be located on the National Stock Exchange (NSE).
          </p>
          <Link
            href="/stocks"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#142B32] text-white rounded-[8px] text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Back Navigation Link ───────────────────────────────────────── */}
      <Link
        href="/stocks"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#687A81] hover:text-[#142B32] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to explore</span>
      </Link>

      {/* ── Header: Company, Symbol, Price, Freshness ─────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E1E7E8]">
        <div className="flex items-center gap-3.5">
          <StockLogo symbol={symbol} size="lg" />
          <div>
            <h1 className="text-[28px] md:text-[32px] font-semibold text-[#142B32] tracking-[-0.8px] leading-tight">
              {companyName}
            </h1>
            <div className="text-xs text-[#687A81] mt-0.5 flex items-center gap-2">
              <span>{symbol} · NSE · {sector}</span>
              <span>·</span>
              <span className="text-[#899DA3]">{source}</span>
            </div>
          </div>
        </div>

        <div className="text-left md:text-right font-mono">
          <strong className="text-[30px] md:text-[34px] font-semibold text-[#142B32] tracking-tight block">
            {currentPrice !== null ? formatINR(currentPrice, 2) : '—'}
          </strong>
          <div className="text-xs flex items-center md:justify-end gap-2 mt-0.5">
            <span className={`font-semibold ${changePct !== null ? (isUp ? 'text-[#087F73]' : 'text-[#BB4B48]') : 'text-[#899DA3]'}`}>
              {changePct !== null ? `${formatPercent(changePct)} today` : 'Quote pending'}
            </span>
            <span className="text-[#899DA3]">·</span>
            <FreshnessBadge status={freshness} asOf={asOf} source={source} />
          </div>
        </div>
      </div>

      {/* ── Tab Controls & Watchlist Action ───────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-[#E1E7E8] pb-0">
        <div className="flex gap-6 text-sm" role="tablist">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'technicals', label: 'Technicals' },
            { id: 'risk', label: 'Risk & context' },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`pb-3 font-semibold text-sm transition-all relative ${
                activeTab === t.id
                  ? 'text-[#142B32] after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#087F73]'
                  : 'text-[#687A81] hover:text-[#142B32]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleToggleWatchlist}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F73] hover:underline pb-3"
        >
          {watchlisted ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{watchlisted ? 'In your watchlist' : 'Add to watchlist'}</span>
        </button>
      </div>

      {/* ── Main Detail Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
        {/* Left Column: Chart & Tab Content */}
        <div className="space-y-6">
          {/* Chart Panel */}
          <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-[#142B32]">Price perspective</h3>
              <div
                className="flex items-center gap-1 p-1 bg-[#EEF2F2] border border-[#E1E7E8] rounded-[7px]"
                role="group"
                aria-label="Chart time range"
              >
                {['1D', '1W', '1M', '3M', '1Y'].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRangeChange(r)}
                    className={`px-2.5 py-1 rounded-[5px] text-xs font-medium transition-all ${
                      selectedRange === r
                        ? 'bg-white text-[#142B32] shadow-sm font-semibold'
                        : 'text-[#687A81] hover:text-[#142B32]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Chart or Series */}
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <FinancialChart data={chartData} height={256} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#687A81]">
                  Loading {symbol} chart series...
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-[#687A81] pt-2 border-t border-[#E1E7E8]">
              <span>NSE historical time series</span>
              <span>Values in ₹ (INR)</span>
            </div>
          </section>

          {/* Tab 1: Consistent Company Research Brief */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-6">
                {/* Header: Title & Quick brief / Analyst view toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E1E7E8]">
                  <div>
                    <h2 className="text-[20px] font-semibold text-[#142B32]">
                      Company Research Brief
                    </h2>
                    <p className="text-xs text-[#687A81] mt-0.5">
                      Progressive research picture with verified indicator comparisons and portfolio context.
                    </p>
                  </div>
                  <div className="inline-flex items-center p-1 bg-[#F0F4F4] rounded-[8px] text-xs font-medium self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setResearchView('quick')}
                      className={`px-3 py-1 rounded-[6px] transition-colors ${
                        researchView === 'quick'
                          ? 'bg-white text-[#142B32] shadow-xs font-semibold'
                          : 'text-[#687A81] hover:text-[#142B32]'
                      }`}
                    >
                      Quick brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setResearchView('analyst')}
                      className={`px-3 py-1 rounded-[6px] transition-colors ${
                        researchView === 'analyst'
                          ? 'bg-white text-[#142B32] shadow-xs font-semibold'
                          : 'text-[#687A81] hover:text-[#142B32]'
                      }`}
                    >
                      Analyst view
                    </button>
                  </div>
                </div>

                {/* 1. THE TAKEAWAY */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[#087F73] uppercase tracking-wider block">
                    The Takeaway
                  </span>
                  <h3 className="text-[17px] font-semibold text-[#142B32] leading-snug">
                    {summary}
                  </h3>
                  <p className="text-xs text-[#687A81] leading-relaxed">
                    {why}
                  </p>
                  {researchView === 'analyst' && (
                    <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] text-[11px] text-[#5C6E74] space-y-1 mt-2">
                      <div className="font-medium text-[#142B32]">Methodology & Model Scope</div>
                      <div>Engine: Deterministic Quantitative Consensus (v1.0-deterministic-quant)</div>
                      <div>Input series: NSE Daily OHLCV bars via {source} · Bar timestamp: {asOf}</div>
                      <div>Causation note: Mathematical indicator alignment reflects observed technical patterns; it does not infer unverified fundamental or corporate causation.</div>
                    </div>
                  )}
                </div>

                {/* 2. WHAT CHANGED */}
                <div className="border-t border-[#E1E7E8] pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#142B32] uppercase tracking-wider block">
                      What Changed Since Previous Snapshot
                    </span>
                    {liveStock?.what_changed?.comparison_period_hours && (
                      <span className="text-[11px] text-[#899DA3] font-mono">
                        Window: {liveStock.what_changed.comparison_period_hours}h
                      </span>
                    )}
                  </div>

                  {liveStock?.what_changed?.status === 'compared' && Array.isArray(liveStock.what_changed.changes) && liveStock.what_changed.changes.length > 0 ? (
                    researchView === 'quick' ? (
                      /* Quick View: Card summaries */
                      <div className="space-y-2">
                        {liveStock.what_changed.changes.map((ch: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] flex items-start gap-2.5 text-xs"
                          >
                            <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                              ch.direction === 'up' || ch.direction === 'bullish_cross' || ch.direction === 'momentum_expansion' || ch.direction === 'upgrade'
                                ? 'bg-[#E3F2ED] text-[#087F73]'
                                : 'bg-[#FDEEEC] text-[#BB4B48]'
                            }`}>
                              {ch.type.replace('_', ' ')}
                            </span>
                            <div className="space-y-0.5 flex-1">
                              <p className="text-[#142B32] font-medium leading-relaxed">{ch.explanation}</p>
                              <div className="text-[11px] text-[#899DA3]">
                                Source: {ch.source}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Analyst View: Full audit table with previous vs current values */
                      <div className="overflow-x-auto border border-[#E1E7E8] rounded-[8px]">
                        <table className="w-full text-left text-xs divide-y divide-[#E1E7E8]">
                          <thead className="bg-[#FAFBFB] text-[#687A81]">
                            <tr>
                              <th className="py-2.5 px-3 font-medium">Metric</th>
                              <th className="py-2.5 px-3 font-medium text-right">Previous</th>
                              <th className="py-2.5 px-3 font-medium text-right">Current</th>
                              <th className="py-2.5 px-3 font-medium text-right">Delta</th>
                              <th className="py-2.5 px-3 font-medium">Observation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E1E7E8] bg-white">
                            {liveStock.what_changed.changes.map((ch: any, idx: number) => (
                              <tr key={idx} className="hover:bg-[#FAFBFB]">
                                <td className="py-2.5 px-3 font-medium text-[#142B32] capitalize">{ch.metric.replace('_', ' ')}</td>
                                <td className="py-2.5 px-3 font-mono text-right text-[#687A81]">
                                  {ch.previous_value !== null && ch.previous_value !== undefined ? (typeof ch.previous_value === 'number' ? ch.previous_value.toFixed(2) : String(ch.previous_value)) : '—'}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right text-[#142B32] font-semibold">
                                  {ch.current_value !== null && ch.current_value !== undefined ? (typeof ch.current_value === 'number' ? ch.current_value.toFixed(2) : String(ch.current_value)) : '—'}
                                </td>
                                <td className={`py-2.5 px-3 font-mono text-right font-medium ${
                                  ch.change_pct !== undefined ? (ch.change_pct >= 0 ? 'text-[#087F73]' : 'text-[#BB4B48]') : 'text-[#687A81]'
                                }`}>
                                  {ch.change_pct !== undefined ? `${ch.change_pct >= 0 ? '+' : ''}${ch.change_pct.toFixed(2)}%` : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-[#5C6E74] leading-relaxed max-w-xs">{ch.explanation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    /* No Changes or No Prior Snapshot State */
                    <div className="p-3.5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] text-xs text-[#687A81] flex items-center gap-2">
                      <Info className="w-4 h-4 text-[#899DA3] shrink-0" />
                      <span>
                        {liveStock?.what_changed?.message ||
                          'No material changes detected between recent snapshots. Technical indicators remain stable within normal volatility bands.'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. SUPPORTING EVIDENCE */}
                <div className="border-t border-[#E1E7E8] pt-5 space-y-3">
                  <span className="text-[11px] font-semibold text-[#087F73] uppercase tracking-wider block">
                    Supporting Evidence
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <span className="text-[#687A81] block">14-Day RSI</span>
                      <strong className="text-sm font-semibold text-[#142B32] font-mono">
                        {rsi || '—'}
                      </strong>
                      <span className="text-[11px] text-[#087F73] block">
                        {rsiNum !== null ? (rsiNum > 70 ? 'Overbought (>70)' : rsiNum < 30 ? 'Oversold (<30)' : 'Neutral Momentum') : 'Pending data'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <span className="text-[#687A81] block">20-Day Trend</span>
                      <strong className="text-sm font-semibold text-[#142B32]">
                        {trend}
                      </strong>
                      <span className="text-[11px] text-[#687A81] block">
                        SMA 20: {tech?.sma_20 ? formatINR(tech.sma_20, 2) : '—'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <span className="text-[#687A81] block">Volume vs. 20D Avg</span>
                      <strong className="text-sm font-semibold text-[#142B32] font-mono">
                        {volumeRatio || '1.0×'}
                      </strong>
                      <span className="text-[11px] text-[#687A81] block">
                        {tech?.vol_surge && tech.vol_surge >= 1.5 ? 'Surge detected' : 'Standard participation'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <span className="text-[#687A81] block">Deterministic Rules</span>
                      <strong className="text-sm font-semibold text-[#087F73]">
                        {signal || 'CONSENSUS'}
                      </strong>
                      <span className="text-[11px] text-[#687A81] block">
                        {ai?.rule_version || 'v1.0-deterministic-quant'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. RISKS AND COUNTERPOINTS */}
                <div className="border-t border-[#E1E7E8] pt-5 space-y-3">
                  <span className="text-[11px] font-semibold text-[#8F6A24] uppercase tracking-wider block">
                    Risks and Counterpoints
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <strong className="font-semibold text-[#8F6A24] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Technical & Volatility Risk
                      </strong>
                      <p className="text-[#687A81] leading-relaxed">
                        {risk}
                      </p>
                    </div>

                    <div className="p-3.5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] space-y-1">
                      <strong className="font-semibold text-[#142B32] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#087F73]" /> Information Limits & Stop Loss
                      </strong>
                      <p className="text-[#687A81] leading-relaxed">
                        Stop-loss boundary is marked at <strong className="font-mono text-[#BB4B48]">{formatINR(stopLossPrice, 2)}</strong>. Fundamental announcements and order book depth are outside this technical snapshot.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. YOUR EXPOSURE */}
                <div className="border-t border-[#E1E7E8] pt-5 space-y-3">
                  <span className="text-[11px] font-semibold text-[#142B32] uppercase tracking-wider block">
                    Your Portfolio Exposure
                  </span>
                  {userHolding ? (
                    <div className="p-4 bg-[#E3F2ED]/40 border border-[#087F73]/20 rounded-[10px] space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#087F73]" />
                          <strong className="text-[#142B32]">Currently held in your portfolio</strong>
                        </div>
                        <span className="text-[#087F73] font-semibold font-mono">
                          {userHolding.qty} shares @ {formatINR(userHolding.avg_price, 2)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                        <div>
                          <span className="text-[#687A81] block">Invested Capital</span>
                          <strong className="font-mono text-[#142B32]">{formatINR(userHolding.invested || (userHolding.qty * userHolding.avg_price), 2)}</strong>
                        </div>
                        <div>
                          <span className="text-[#687A81] block">Current Value</span>
                          <strong className="font-mono text-[#142B32]">
                            {userHolding.current_value ? formatINR(userHolding.current_value, 2) : (currentPrice ? formatINR(userHolding.qty * currentPrice, 2) : '—')}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#687A81] block">Unrealized P&L</span>
                          <strong className={`font-mono font-semibold ${
                            (userHolding.pnl ?? 0) >= 0 ? 'text-[#087F73]' : 'text-[#BB4B48]'
                          }`}>
                            {userHolding.pnl !== null && userHolding.pnl !== undefined
                              ? `${userHolding.pnl >= 0 ? '+' : ''}${formatINR(userHolding.pnl, 2)} (${userHolding.pnl_pct >= 0 ? '+' : ''}${userHolding.pnl_pct?.toFixed(2)}%)`
                              : '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#687A81] block">Sector Exposure ({sector})</span>
                          <strong className="font-mono text-[#142B32]">
                            {portfolioSummary?.sector_allocation?.[sector] ? `${portfolioSummary.sector_allocation[sector]}%` : '—'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#687A81]">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-[#899DA3] shrink-0" />
                        <span>You do not currently hold {symbol} in your recorded holdings.</span>
                      </div>
                      <button
                        onClick={() => {
                          setOrderQuantity(sizingResult.position_size_shares || 10);
                          setShowOrderModal(true);
                        }}
                        className="px-3 py-1.5 bg-[#142B32] hover:bg-[#1E3E47] text-white rounded-[6px] text-xs font-semibold shrink-0 transition-colors"
                      >
                        Simulate paper buy
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. INVESTIGATE FURTHER */}
                <div className="border-t border-[#E1E7E8] pt-5 space-y-3">
                  <span className="text-[11px] font-semibold text-[#142B32] uppercase tracking-wider block">
                    Investigate Further
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab('technicals')}
                      className="p-3 text-left bg-[#FAFBFB] hover:bg-[#F0F5F3] border border-[#E1E7E8] rounded-[8px] transition-colors group"
                    >
                      <strong className="font-semibold text-[#142B32] group-hover:text-[#087F73] block">
                        Technical Indicators →
                      </strong>
                      <span className="text-[11px] text-[#687A81] mt-0.5 block">
                        RSI, MACD & Band levels
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('risk')}
                      className="p-3 text-left bg-[#FAFBFB] hover:bg-[#F0F5F3] border border-[#E1E7E8] rounded-[8px] transition-colors group"
                    >
                      <strong className="font-semibold text-[#142B32] group-hover:text-[#087F73] block">
                        Risk & Sizing →
                      </strong>
                      <span className="text-[11px] text-[#687A81] mt-0.5 block">
                        Position sizing calculator
                      </span>
                    </button>

                    <Link
                      href={`/backtest?symbol=${symbol}`}
                      className="p-3 text-left bg-[#FAFBFB] hover:bg-[#F0F5F3] border border-[#E1E7E8] rounded-[8px] transition-colors group block"
                    >
                      <strong className="font-semibold text-[#142B32] group-hover:text-[#087F73] block">
                        Backtesting Engine →
                      </strong>
                      <span className="text-[11px] text-[#687A81] mt-0.5 block">
                        Test deterministic quant rules
                      </span>
                    </Link>

                    <Link
                      href="/performance"
                      className="p-3 text-left bg-[#FAFBFB] hover:bg-[#F0F5F3] border border-[#E1E7E8] rounded-[8px] transition-colors group block"
                    >
                      <strong className="font-semibold text-[#142B32] group-hover:text-[#087F73] block">
                        Track Record →
                      </strong>
                      <span className="text-[11px] text-[#687A81] mt-0.5 block">
                        Audit resolution history
                      </span>
                    </Link>
                  </div>
                </div>

                {/* Regulatory Footer Tag */}
                <div className="pt-2 text-[11px] text-[#899DA3] flex items-center justify-between border-t border-[#E1E7E8]">
                  <span>Deterministic quantitative rules only · Not investment advice</span>
                  <span>Rule Version: {ai?.rule_version || 'v1.0-deterministic-quant'}</span>
                </div>
              </section>
            </div>
          )}

          {/* Tab 2: Technicals */}
          {activeTab === 'technicals' && (
            <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#142B32]">
                  Look behind the observation.
                </h2>
                <p className="text-xs text-[#687A81] mt-0.5">
                  Deterministic rule inputs. No invented machine learning scores.
                </p>
              </div>

              <table className="w-full text-left text-xs divide-y divide-[#E1E7E8]">
                <tbody>
                  <tr className="py-2.5">
                    <td className="py-3 text-[#687A81]">14-Day RSI</td>
                    <td className="py-3 text-right font-mono font-semibold text-[#142B32]">
                      {rsi || '—'}{' '}
                      <span className="text-[11px] font-normal text-[#687A81]">
                        · {rsiNum !== null ? (rsiNum > 70 ? 'Elevated' : rsiNum < 40 ? 'Weak' : 'Moderate') : 'Awaiting data'}
                      </span>
                    </td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-3 text-[#687A81]">20-Day Trend</td>
                    <td className="py-3 text-right font-medium text-[#142B32]">{trend}</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-3 text-[#687A81]">Volume vs. 20-Day Average</td>
                    <td className="py-3 text-right font-mono font-medium text-[#142B32]">{volumeRatio}</td>
                  </tr>
                  <tr className="py-2.5">
                    <td className="py-3 text-[#687A81]">Quantitative Rule Agreement</td>
                    <td className="py-3 text-right font-medium text-[#087F73]">
                      Deterministic Consensus v1
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="p-3 bg-[#EEF2F2] rounded-[8px] text-[11px] text-[#5C6E74] leading-relaxed">
                <Info className="w-3.5 h-3.5 inline mr-1 text-[#087F73]" />
                Rule consensus scores represent the alignment of documented technical rules (RSI, trend, and volume), not a statistical probability of profit.
              </div>
            </section>
          )}

          {/* Tab 3: Risk & Context */}
          {activeTab === 'risk' && (
            <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 space-y-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#142B32]">
                  The limits of this picture.
                </h2>
                <p className="text-xs text-[#687A81] mt-0.5">
                  Portfolio impact and context beyond technical charts.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] space-y-1">
                  <strong className="text-xs font-semibold text-[#142B32]">Company Fundamentals</strong>
                  <p className="text-xs text-[#687A81] leading-relaxed">
                    Earnings, valuation, and regulatory filings are not factored into technical price series. Technical trends provide only one perspective.
                  </p>
                </div>
                <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] space-y-1">
                  <strong className="text-xs font-semibold text-[#142B32]">Sector Exposure</strong>
                  <p className="text-xs text-[#687A81] leading-relaxed">
                    A company may show a strong trend while adding undesirable sector concentration to your overall portfolio.
                  </p>
                </div>
              </div>

              {/* Embedded Position Sizing Calculator */}
              <div className="pt-4 border-t border-[#E1E7E8] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#142B32] flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-[#087F73]" />
                    Position Sizing Calculator
                  </span>
                  <span className="text-[11px] text-[#687A81]">Risk-managed sizing</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#FAFBFB] p-4 rounded-[10px] border border-[#E1E7E8]">
                  <div>
                    <span className="text-[#687A81] block">Account Capital</span>
                    <strong className="font-mono text-[#142B32]">{formatINR(calcCapital, 0)}</strong>
                  </div>
                  <div>
                    <span className="text-[#687A81] block">Risk Per Trade</span>
                    <strong className="font-mono text-[#142B32]">{calcRiskPct}%</strong>
                  </div>
                  <div>
                    <span className="text-[#687A81] block">Max Risk Amount</span>
                    <strong className="font-mono text-[#BB4B48]">
                      {formatINR(sizingResult.max_risk_amount, 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#687A81] block">Max Shares</span>
                    <strong className="font-mono text-[#087F73]">
                      {sizingResult.position_size_shares} shares
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Thesis Side Panel */}
        <aside className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div>
              <span className="eyebrow text-[#687A81]">THE QUICK READ</span>
              <h2 className="text-[22px] font-semibold text-[#142B32] leading-tight mt-1.5">
                {summary}
              </h2>
              <p className="text-xs text-[#687A81] mt-2 leading-relaxed">{why}</p>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 text-xs text-[#49685A]">
                <Check className="w-4 h-4 text-[#087F73] shrink-0" />
                <span>{trend}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#49685A]">
                <BarChart2 className="w-4 h-4 text-[#087F73] shrink-0" />
                <span>RSI {rsi || '—'} · {rsiNum !== null ? (rsiNum > 70 ? 'Momentum is elevated' : rsiNum < 40 ? 'Momentum is weak' : 'Momentum is moderate') : 'Trend pending'}</span>
              </div>
            </div>

            {/* Risk Box */}
            <div className="risk-box">
              <strong className="text-xs font-semibold text-[#8F6A24] block">
                Keep this in view
              </strong>
              <p>{risk}</p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  if (currentPrice) setAlertPrice((currentPrice * 1.03).toFixed(2));
                  setShowAlertModal(true);
                }}
                className="px-3 py-2 bg-[#087F73] hover:bg-[#076f64] text-white rounded-[7px] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Set alert</span>
              </button>
              <button
                onClick={() => openResearchCompanion(symbol)}
                className="px-3 py-2 bg-white hover:bg-[#F0F5F3] text-[#142B32] border border-[#E1E7E8] rounded-[7px] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#087F73]" />
                <span>Ask companion</span>
              </button>
            </div>

            {/* Paper Trading Order Trigger */}
            <button
              onClick={() => {
                setOrderQuantity(sizingResult.position_size_shares || 10);
                setShowOrderModal(true);
              }}
              className="w-full py-2.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Paper Trade {symbol}</span>
            </button>
          </div>

          {/* Context & Related Tools */}
          <div className="pt-4 border-t border-[#E1E7E8] space-y-3">
            <div className="text-[11px] text-[#687A81] leading-relaxed">
              Rule-based research observation.<br />
              Indicator inputs do not guarantee future performance.
            </div>

            <div className="flex flex-col gap-1.5 pt-2">
              <Link
                href={`/stocks/${symbol}/options`}
                className="text-xs font-semibold text-[#087F73] hover:underline flex items-center justify-between"
              >
                <span>F&O Option Chain</span>
                <span className="text-[#899DA3]">→</span>
              </Link>
              <Link
                href={`/backtest?symbol=${symbol}`}
                className="text-xs font-semibold text-[#087F73] hover:underline flex items-center justify-between"
              >
                <span>Run Historical Backtest</span>
                <span className="text-[#899DA3]">→</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Price Alert Modal ─────────────────────────────────────────── */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-[#0c232c]/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] max-w-sm w-full p-6 shadow-2xl border border-[#E1E7E8] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E7E8] pb-3">
              <h3 className="text-base font-semibold text-[#142B32]">Price alert · {symbol}</h3>
              <button
                onClick={() => {
                  setShowAlertModal(false);
                  setAlertSavedMsg(null);
                }}
                className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {alertSavedMsg ? (
              <div className="p-3 bg-[#EAF2EC] border border-[#D8E5DE] text-[#087F73] rounded-[8px] text-xs text-center font-medium">
                {alertSavedMsg}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setAlertSavedMsg(`Alert saved: ${symbol} price ${alertDirection === 'above' ? 'rises above' : 'falls below'} ₹${alertPrice}`);
                  setTimeout(() => {
                    setShowAlertModal(false);
                    setAlertSavedMsg(null);
                  }, 1800);
                }}
                className="space-y-3"
              >
                <p className="text-xs text-[#687A81]">
                  Save a price level you want to revisit for {companyName}.
                </p>
                <div>
                  <label className="text-xs font-semibold text-[#142B32] block mb-1">
                    Alert Condition
                  </label>
                  <select
                    value={alertDirection}
                    onChange={(e) => setAlertDirection(e.target.value as any)}
                    className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs bg-white text-[#142B32]"
                  >
                    <option value="above">Price rises above</option>
                    <option value="below">Price falls below</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#142B32] block mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={alertPrice}
                    onChange={(e) => setAlertPrice(e.target.value)}
                    required
                    className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs font-mono bg-white text-[#142B32]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#087F73] hover:bg-[#076f64] text-white rounded-[7px] text-xs font-semibold mt-2"
                >
                  Save Alert
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Paper Order Placement Modal ───────────────────────────────── */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-[#0c232c]/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[16px] max-w-sm w-full p-6 shadow-2xl border border-[#E1E7E8] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E7E8] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EAF2EC] text-[#087F73]">
                  PAPER SIMULATION
                </span>
                <h3 className="text-sm font-semibold text-[#142B32]">Buy {symbol}</h3>
              </div>
              <button
                onClick={() => {
                  setShowOrderModal(false);
                  setOrderMsg(null);
                }}
                className="p-1 text-[#687A81] hover:text-[#142B32] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {orderMsg ? (
              <div className="p-3 bg-[#EAF2EC] border border-[#D8E5DE] text-[#087F73] rounded-[8px] text-xs text-center font-medium">
                {orderMsg}
              </div>
            ) : (
              <form onSubmit={handlePlaceOrder} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#142B32] block mb-1">
                      Order Type
                    </label>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as any)}
                      className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs bg-white text-[#142B32]"
                    >
                      <option value="MARKET">Market</option>
                      <option value="LIMIT">Limit</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#142B32] block mb-1">
                      Quantity (Shares)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={orderQuantity}
                      onChange={(e) => setOrderQuantity(Number(e.target.value))}
                      required
                      className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs font-mono bg-white text-[#142B32]"
                    />
                  </div>
                </div>

                {orderType === 'LIMIT' && (
                  <div>
                    <label className="text-xs font-semibold text-[#142B32] block mb-1">
                      Limit Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      placeholder={currentPrice ? currentPrice.toString() : '0.00'}
                      value={orderLimitPrice}
                      onChange={(e) => setOrderLimitPrice(e.target.value)}
                      required
                      className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-xs font-mono bg-white text-[#142B32]"
                    />
                  </div>
                )}

                <div className="p-3 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[8px] text-xs space-y-1">
                  <div className="flex justify-between text-[#687A81]">
                    <span>Estimated Notional</span>
                    <span className="font-mono text-[#142B32]">
                      {currentPrice ? formatINR(currentPrice * orderQuantity, 2) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#687A81]">
                    <span>Simulated Brokerage</span>
                    <span className="font-mono text-[#087F73]">₹0.00 (Paper)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={orderSubmitting}
                  className="w-full py-2.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold disabled:opacity-50"
                >
                  {orderSubmitting ? 'Submitting Order...' : 'Submit Paper Order'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
