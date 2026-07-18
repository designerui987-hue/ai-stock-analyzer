// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DEMO_STOCKS } from '@/lib/data';

// ───────────────────────────────────────────────────────────
// Data
// ───────────────────────────────────────────────────────────
const AI_DATA: Record<string, any> = {
  RELIANCE: {
    signal: 'BUY', confidence: 84, risk: 'Low', riskScore: 3.2,
    entry: 2450, target: 2780, stopLoss: 2310, upside: 13.4, profitProb: 78,
    reasons: [
      'Strong earnings growth: 18% YoY profit increase last quarter',
      'Bullish MACD crossover with rising volume momentum',
      'Green energy investments create new long-term revenue catalyst',
      'Price holding above 200-day SMA—trend structure intact',
    ],
    accuracy: 74, rsi: 58.4, macd: 2.34, pe: 26.8,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 88 },
      { name: 'LightGBM', signal: 'BUY', conf: 82 },
      { name: 'Neural Net', signal: 'BUY', conf: 79 },
      { name: 'Prophet', signal: 'HOLD', conf: 61 },
    ],
  },
  TCS: {
    signal: 'HOLD', confidence: 63, risk: 'Medium', riskScore: 4.1,
    entry: 3800, target: 4150, stopLoss: 3640, upside: 6.6, profitProb: 58,
    reasons: [
      'Revenue growth moderating amid global IT spending slowdown',
      'P/E ratio of 32x slightly elevated vs. earnings guidance',
      'Strong deal pipeline but execution uncertainty remains',
      'Price consolidating in tight range — wait for breakout',
    ],
    accuracy: 68, rsi: 52.1, macd: -1.23, pe: 32.1,
    models: [
      { name: 'XGBoost', signal: 'HOLD', conf: 70 },
      { name: 'LightGBM', signal: 'BUY', conf: 54 },
      { name: 'Neural Net', signal: 'HOLD', conf: 65 },
      { name: 'Prophet', signal: 'HOLD', conf: 62 },
    ],
  },
  HDFCBANK: {
    signal: 'BUY', confidence: 79, risk: 'Low', riskScore: 2.7,
    entry: 1620, target: 1870, stopLoss: 1545, upside: 13.6, profitProb: 73,
    reasons: [
      'NIM expansion expected from anticipated RBI rate cuts',
      'Loan book growing at 18% with improving asset quality',
      'RSI at 61 — bullish momentum without overbought conditions',
      'FII buying pattern detected over last 10 sessions',
    ],
    accuracy: 76, rsi: 61.2, macd: 3.45, pe: 19.5,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 82 },
      { name: 'LightGBM', signal: 'BUY', conf: 78 },
      { name: 'Neural Net', signal: 'BUY', conf: 75 },
      { name: 'Prophet', signal: 'HOLD', conf: 58 },
    ],
  },
  TATAMOTORS: {
    signal: 'BUY', confidence: 89, risk: 'Medium', riskScore: 4.5,
    entry: 875, target: 1040, stopLoss: 828, upside: 18.9, profitProb: 81,
    reasons: [
      'JLR sales surging — record quarterly volumes reported',
      'EV transition gaining momentum, market rewarding execution',
      'Breakout above key resistance at ₹870 with 180% volume surge',
      'Debt reduction ahead of schedule boosts margin outlook',
    ],
    accuracy: 79, rsi: 65.3, macd: 5.67, pe: 8.5,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 92 },
      { name: 'LightGBM', signal: 'BUY', conf: 88 },
      { name: 'Neural Net', signal: 'BUY', conf: 85 },
      { name: 'Prophet', signal: 'BUY', conf: 70 },
    ],
  },
  MARUTI: {
    signal: 'SELL', confidence: 73, risk: 'High', riskScore: 6.5,
    entry: 10876, target: 9800, stopLoss: 11250, upside: -9.9, profitProb: 41,
    reasons: [
      'RSI at 72 — approaching overbought territory',
      'Margin pressure from rising input costs and discounting',
      'EV disruption risk as competitor market share grows',
      'Price near 52-week high with fading momentum indicators',
    ],
    accuracy: 69, rsi: 72.4, macd: -3.45, pe: 28.9,
    models: [
      { name: 'XGBoost', signal: 'SELL', conf: 77 },
      { name: 'LightGBM', signal: 'SELL', conf: 72 },
      { name: 'Neural Net', signal: 'HOLD', conf: 61 },
      { name: 'Prophet', signal: 'SELL', conf: 68 },
    ],
  },
  BHARTIARTL: {
    signal: 'BUY', confidence: 83, risk: 'Low', riskScore: 3.8,
    entry: 1155, target: 1340, stopLoss: 1092, upside: 16.0, profitProb: 76,
    reasons: [
      'Subscriber base crossing 400M — market leadership secured',
      'ARPU (Average Revenue Per User) rising every quarter',
      'Strong 5G rollout positioning for enterprise contracts',
      'Volume breakout above 10-day average — institutions buying',
    ],
    accuracy: 77, rsi: 67.8, macd: 4.12, pe: 75.3,
    models: [
      { name: 'XGBoost', signal: 'BUY', conf: 86 },
      { name: 'LightGBM', signal: 'BUY', conf: 81 },
      { name: 'Neural Net', signal: 'BUY', conf: 83 },
      { name: 'Prophet', signal: 'HOLD', conf: 65 },
    ],
  },
};

function getAI(symbol: string) {
  return AI_DATA[symbol] || {
    signal: 'HOLD', confidence: 58, risk: 'Medium', riskScore: 5.0,
    entry: 0, target: 0, stopLoss: 0, upside: 0, profitProb: 52,
    reasons: [
      'Mixed signals from technical and fundamental analysis',
      'Volume patterns inconclusive — no clear trend direction',
      'Await stronger catalyst before entering new position',
    ],
    accuracy: 62, rsi: 50, macd: 0, pe: 25,
    models: [
      { name: 'XGBoost', signal: 'HOLD', conf: 60 },
      { name: 'LightGBM', signal: 'HOLD', conf: 58 },
      { name: 'Neural Net', signal: 'HOLD', conf: 55 },
      { name: 'Prophet', signal: 'BUY', conf: 52 },
    ],
  };
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SIG_STYLES = {
  BUY:  { text: 'text-[#00d68f]', bg: 'bg-[#00d68f]/10 border-[#00d68f]/20', dot: 'bg-[#00d68f]', glow: 'shadow-[0_0_24px_rgba(0,214,143,0.25)]' },
  SELL: { text: 'text-[#ff4d6a]', bg: 'bg-[#ff4d6a]/10 border-[#ff4d6a]/20', dot: 'bg-[#ff4d6a]', glow: 'shadow-[0_0_24px_rgba(255,77,106,0.25)]' },
  HOLD: { text: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10 border-[#f59e0b]/20', dot: 'bg-[#f59e0b]', glow: '' },
};

const RISK_STYLES: Record<string, string> = {
  Low:    'text-[#00d68f] bg-[#00d68f]/10 border-[#00d68f]/20',
  Medium: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  High:   'text-[#ff4d6a] bg-[#ff4d6a]/10 border-[#ff4d6a]/20',
};

// ───────────────────────────────────────────────────────────
// Chart Generator
// ───────────────────────────────────────────────────────────
function buildChart(basePrice: number, signal: string) {
  const pts: number[] = [];
  let p = basePrice * 0.88;
  const trend = signal === 'BUY' ? 0.0004 : signal === 'SELL' ? -0.0003 : 0.0001;
  for (let i = 0; i < 90; i++) {
    p *= 1 + trend + (Math.random() - 0.49) * 0.018;
    pts.push(p);
  }
  const minP = Math.min(...pts);
  const maxP = Math.max(...pts);
  const span = maxP - minP || 1;
  const W = 1000, H = 260;
  const pad = 20;

  const toX = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const toY = (v: number) => H - pad - ((v - minP) / span) * (H - pad * 2);

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
  const area = `${line} L ${toX(pts.length - 1)} ${H} L ${toX(0)} ${H} Z`;

  // SMA 20
  const sma: number[] = pts.map((_, i) => {
    const sl = pts.slice(Math.max(0, i - 19), i + 1);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
  const smaLine = sma.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');

  // Entry / stop-loss zones
  const entryY = toY(basePrice);
  const stopY  = toY(signal === 'BUY' ? basePrice * 0.95 : basePrice * 1.05);
  const targetY = toY(signal === 'BUY' ? basePrice * 1.13 : basePrice * 0.9);

  const isUp = signal !== 'SELL';
  const color = isUp ? '#00d68f' : '#ff4d6a';

  return { line, area, smaLine, color, W, H, entryY, stopY, targetY, toX, pts };
}

// ───────────────────────────────────────────────────────────
// AI Loading Steps
// ───────────────────────────────────────────────────────────
const LOADING_STEPS = [
  { icon: '📡', label: 'Fetching market data…' },
  { icon: '📊', label: 'Analyzing fundamentals…' },
  { icon: '🔬', label: 'Checking technical signals…' },
  { icon: '🤖', label: 'Running AI models…' },
  { icon: '✅', label: 'Generating insights…' },
];

function AILoader({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step < LOADING_STEPS.length - 1) {
      const t = setTimeout(() => setStep(s => s + 1), 480);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onDone, 520);
      return () => clearTimeout(t);
    }
  }, [step, onDone]);

  return (
    <div className="card p-8 flex flex-col items-center gap-6">
      {/* Spinning ring */}
      <div className="relative w-20 h-20">
        <svg className="animate-spin-slow absolute inset-0" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="4" />
          <circle cx="40" cy="40" r="36" fill="none" stroke="url(#ring-grad)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray="60 166" />
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl">
          {LOADING_STEPS[step].icon}
        </div>
      </div>

      {/* Steps list */}
      <div className="w-full max-w-xs space-y-2">
        {LOADING_STEPS.map((s, i) => (
          <div key={i} className={`flex items-center gap-3 transition-all duration-300 ${i < step ? 'opacity-40' : i === step ? 'opacity-100' : 'opacity-20'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all ${i < step ? 'bg-[#00d68f]/20 text-[#00d68f]' : i === step ? 'bg-[#6366f1]/20 text-[#6366f1]' : 'bg-white/5 text-[#4a5668]'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-white font-medium' : 'text-[#8b9cb5]'}`}>
              {s.label}
            </span>
            {i === step && (
              <div className="ml-auto flex gap-0.5">
                {[0.1, 0.2, 0.3].map(d => (
                  <div key={d} className="w-1 h-1 rounded-full bg-[#6366f1] animate-bounce"
                    style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#4a5668] text-center">AI analysing {LOADING_STEPS[step].label.toLowerCase().replace('…','')}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// AI Insight Card (The Hero Component)
// ───────────────────────────────────────────────────────────
function AIInsightCard({ ai, stock }: { ai: any; stock: any }) {
  const s = SIG_STYLES[ai.signal as keyof typeof SIG_STYLES];
  const [savedToWatchlist, setSavedToWatchlist] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className={`card border ${s.bg} ${s.glow} p-6 space-y-6`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#8b9cb5] uppercase tracking-widest mb-1 font-semibold">AI Decision</p>
          <div className="flex items-center gap-3">
            <span className={`text-5xl font-black tracking-tight ${s.text}`}>{ai.signal}</span>
            <div className={`w-3 h-3 rounded-full ${s.dot} relative`}>
              <div className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-60`} />
            </div>
          </div>
        </div>
        <button
          onClick={() => setSavedToWatchlist(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${savedToWatchlist ? 'bg-[#6366f1]/15 border-[#6366f1]/30 text-[#818cf8]' : 'border-[var(--border)] text-[#8b9cb5] hover:text-white hover:border-[#6366f1]/30'}`}>
          {savedToWatchlist ? '★ Watchlisted' : '☆ Watchlist'}
        </button>
      </div>

      {/* Confidence + Risk */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-surface p-4 rounded-xl">
          <p className="text-xs text-[#8b9cb5] mb-2">AI Confidence</p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-bold text-white">{ai.confidence}%</span>
          </div>
          <div className="progress-track h-1.5">
            <div className="progress-fill bg-gradient-to-r from-[#6366f1] to-[#a855f7]"
              style={{ width: `${ai.confidence}%` }} />
          </div>
        </div>
        <div className="card-surface p-4 rounded-xl">
          <p className="text-xs text-[#8b9cb5] mb-2">Risk Level</p>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${RISK_STYLES[ai.risk]}`}>
            {ai.risk === 'Low' ? '🟢' : ai.risk === 'Medium' ? '🟡' : '🔴'} {ai.risk}
          </span>
          <p className="text-xs text-[#4a5668] mt-2">Score: {ai.riskScore}/10</p>
        </div>
      </div>

      {/* Why AI says this */}
      <div>
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest mb-3 font-semibold">💡 Why AI says {ai.signal}</p>
        <ul className="space-y-2">
          {ai.reasons.map((r: string, i: number) => (
            <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-start gap-2.5 text-sm text-[#c8d3e0]">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
              {r}
            </motion.li>
          ))}
        </ul>
      </div>

      {/* Action: Entry / Target / Stop */}
      <div>
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest mb-3 font-semibold">🎯 Action Plan</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Entry', value: ai.entry, color: 'text-[#00d68f]', border: 'border-[#00d68f]/20 bg-[#00d68f]/5' },
            { label: 'Target', value: ai.target, color: 'text-[#6366f1]',  border: 'border-[#6366f1]/20 bg-[#6366f1]/5' },
            { label: 'Stop Loss', value: ai.stopLoss, color: 'text-[#ff4d6a]', border: 'border-[#ff4d6a]/20 bg-[#ff4d6a]/5' },
          ].map(({ label, value, color, border }) => (
            <div key={label} className={`rounded-xl p-3 border text-center ${border}`}>
              <p className="text-[10px] text-[#8b9cb5] mb-1 font-medium">{label}</p>
              <p className={`text-sm font-bold ${color}`}>₹{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-[#8b9cb5]">Potential upside</span>
          <span className={`text-sm font-bold ${ai.upside >= 0 ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
            {ai.upside >= 0 ? '+' : ''}{ai.upside}%
          </span>
        </div>
      </div>

      {/* Profit probability */}
      <div className="card-surface rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-[#8b9cb5] font-medium">Profit Probability</span>
          <span className="text-sm font-bold text-white">{ai.profitProb}%</span>
        </div>
        <div className="progress-track h-2">
          <div className="progress-fill" style={{
            width: `${ai.profitProb}%`,
            background: ai.profitProb > 65 ? 'linear-gradient(90deg,#00d68f,#06b6d4)'
              : ai.profitProb > 45 ? 'linear-gradient(90deg,#f59e0b,#f97316)'
              : 'linear-gradient(90deg,#ff4d6a,#dc2626)',
          }} />
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────
// Model Breakdown
// ───────────────────────────────────────────────────────────
function ModelBreakdown({ models }: { models: any[] }) {
  return (
    <div className="card p-5 space-y-3">
      <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">🧠 Model Votes</p>
      {models.map((m, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-[#8b9cb5] w-24 flex-shrink-0">{m.name}</span>
          <div className="flex-1 progress-track h-1.5">
            <div className="progress-fill bg-gradient-to-r from-[#6366f1] to-[#a855f7]"
              style={{ width: `${m.conf}%` }} />
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
            m.signal === 'BUY' ? 'text-[#00d68f] bg-[#00d68f]/10 border-[#00d68f]/20'
            : m.signal === 'SELL' ? 'text-[#ff4d6a] bg-[#ff4d6a]/10 border-[#ff4d6a]/20'
            : 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20'
          }`}>{m.signal}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Trust Layer
// ───────────────────────────────────────────────────────────
function TrustLayer({ ai }: { ai: any }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      className="card p-5 space-y-4">
      <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">🔒 Trust & Accuracy</p>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Historical Accuracy', value: `${ai.accuracy}%`, sub: 'Last 90 days' },
          { label: 'Models Used', value: '4', sub: 'Ensemble AI' },
          { label: 'Signals Today', value: '12', sub: 'Across NIFTY 50' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card-surface rounded-xl p-3">
            <div className="text-lg font-bold text-white">{value}</div>
            <div className="text-[10px] text-[#00d68f] font-semibold">{sub}</div>
            <div className="text-[10px] text-[#4a5668] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {['XGBoost Model', 'LightGBM Model', 'Neural Network', 'Prophet Forecast'].map(m => (
          <span key={m} className="trust-badge">{m}</span>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-[#f59e0b]/5 border border-[#f59e0b]/15">
        <span className="text-sm flex-shrink-0">⚠️</span>
        <p className="text-[11px] text-[#8b9cb5] leading-relaxed">
          <strong className="text-[#f59e0b]">Disclaimer:</strong> This is AI-generated analysis for educational purposes only.
          Not financial advice. Always consult a SEBI-registered advisor before investing.
        </p>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────
// Premium Chart
// ───────────────────────────────────────────────────────────
function PremiumChart({ stock, ai }: { stock: any; ai: any }) {
  const [period, setPeriod] = useState('1Y');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chart = buildChart(stock.price, ai.signal);
  const isUp = ai.signal !== 'SELL';

  // Trend badge
  const trendLabel = ai.signal === 'BUY' ? '↗ Bullish Trend' : ai.signal === 'SELL' ? '↘ Bearish Trend' : '→ Sideways';
  const trendColor = ai.signal === 'BUY' ? 'text-[#00d68f] bg-[#00d68f]/10 border-[#00d68f]/20'
    : ai.signal === 'SELL' ? 'text-[#ff4d6a] bg-[#ff4d6a]/10 border-[#ff4d6a]/20'
    : 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20';

  const hoverPrice = hoverIdx !== null ? chart.pts[hoverIdx] : null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">Price Chart</h3>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${trendColor}`}>
            {trendLabel}
          </span>
        </div>
        <div className="flex gap-1">
          {['1M','3M','6M','1Y','5Y'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${period === p ? 'bg-[#6366f1]/20 text-[#818cf8]' : 'text-[#4a5668] hover:text-[#8b9cb5]'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-[#4a5668]">
        <span className="flex items-center gap-1.5"><span className="w-4 h-px" style={{background: chart.color, display:'inline-block'}} /> Price</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-[#f59e0b]" style={{display:'inline-block'}} /> SMA 20</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{background:'rgba(0,214,143,0.15)', border:'1px dashed rgba(0,214,143,0.4)', display:'inline-block'}} /> Entry Zone</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{background:'rgba(255,77,106,0.1)', border:'1px dashed rgba(255,77,106,0.35)', display:'inline-block'}} /> Stop Zone</span>
        {hoverPrice && <span className="ml-auto text-white font-semibold">₹{hoverPrice.toFixed(2)}</span>}
      </div>

      <div className="relative" style={{ touchAction: 'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full"
          style={{ height: 240 }}
          onMouseMove={(e) => {
            const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width * chart.W;
            const idx = Math.round((px - 20) / (chart.W - 40) * (chart.pts.length - 1));
            setHoverIdx(Math.max(0, Math.min(chart.pts.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chart.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={chart.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Entry zone */}
          {ai.signal !== 'HOLD' && (
            <rect x="20" y={Math.min(chart.entryY, chart.targetY)}
              width={chart.W - 40}
              height={Math.abs(chart.entryY - chart.targetY)}
              className="chart-entry-zone" />
          )}
          {/* Stop zone */}
          {ai.signal !== 'HOLD' && (
            <rect x="20" y={Math.min(chart.entryY, chart.stopY)}
              width={chart.W - 40}
              height={Math.abs(chart.entryY - chart.stopY)}
              className="chart-stop-zone" />
          )}

          {/* Area fill */}
          <path d={chart.area} fill="url(#areaGrad)" />
          {/* Price line */}
          <path d={chart.line} fill="none" stroke={chart.color} strokeWidth="2.5" strokeLinejoin="round" />
          {/* SMA line */}
          <path d={chart.smaLine} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.7" />

          {/* Entry line */}
          {ai.entry > 0 && (
            <line x1="20" x2={chart.W - 20} y1={chart.entryY} y2={chart.entryY}
              stroke="#00d68f" strokeWidth="1" strokeDasharray="6 4" opacity="0.6" />
          )}
          {/* Stop line */}
          {ai.stopLoss > 0 && (
            <line x1="20" x2={chart.W - 20} y1={chart.stopY} y2={chart.stopY}
              stroke="#ff4d6a" strokeWidth="1" strokeDasharray="6 4" opacity="0.6" />
          )}

          {/* Hover crosshair */}
          {hoverIdx !== null && (() => {
            const hx = 20 + (hoverIdx / (chart.pts.length - 1)) * (chart.W - 40);
            const hy = chart.H - 20 - ((chart.pts[hoverIdx] - Math.min(...chart.pts)) / (Math.max(...chart.pts) - Math.min(...chart.pts) || 1)) * (chart.H - 40);
            return (
              <g>
                <line x1={hx} x2={hx} y1="0" y2={chart.H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={hx} cy={hy} r="5" fill={chart.color} stroke="white" strokeWidth="2" />
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Quick Stats
// ───────────────────────────────────────────────────────────
function QuickStats({ stock, ai }: { stock: any; ai: any }) {
  const stats = [
    { label: 'P/E Ratio', value: ai.pe?.toFixed(1) ?? '—' },
    { label: 'RSI (14)', value: ai.rsi.toFixed(1), note: ai.rsi > 70 ? 'Overbought' : ai.rsi < 30 ? 'Oversold' : 'Neutral' },
    { label: 'MACD', value: ai.macd.toFixed(2), note: ai.macd > 0 ? 'Bullish' : 'Bearish' },
    { label: '52W High', value: `₹${stock.price ? (stock.price * 1.15).toFixed(0) : '—'}` },
    { label: '52W Low',  value: `₹${stock.price ? (stock.price * 0.82).toFixed(0) : '—'}` },
    { label: 'Volume',   value: `${((stock.volume ?? 0) / 1e6).toFixed(1)}M` },
    { label: 'Mkt Cap',  value: stock.market_cap ?? '—' },
    { label: 'Sector',   value: stock.sector ?? '—' },
  ];

  return (
    <div className="card p-5">
      <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold mb-3">📌 Quick Stats</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ label, value, note }) => (
          <div key={label} className="card-surface rounded-xl p-3">
            <p className="text-[10px] text-[#4a5668] mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-white truncate">{value}</p>
            {note && <p className={`text-[10px] mt-0.5 ${note === 'Bullish' || note === 'Neutral' ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>{note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// News Sentiment
// ───────────────────────────────────────────────────────────
function NewsSentiment({ stock }: { stock: any }) {
  const news = [
    { title: `${stock.name} reports strong quarterly results, beats estimates`, source: 'Economic Times', sentiment: 'positive', score: 0.82, time: '2h' },
    { title: `Analyst upgrades ${stock.symbol} with ₹${(stock.price * 1.1).toFixed(0)} target`, source: 'Moneycontrol', sentiment: 'positive', score: 0.76, time: '4h' },
    { title: `${stock.sector} sector faces headwinds from global cues`, source: 'LiveMint', sentiment: 'neutral', score: 0.52, time: '6h' },
  ];
  return (
    <div className="card p-5">
      <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold mb-3">📰 News & Sentiment</p>
      <div className="space-y-3">
        {news.map((n, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.sentiment === 'positive' ? 'bg-[#00d68f]' : n.sentiment === 'negative' ? 'bg-[#ff4d6a]' : 'bg-[#f59e0b]'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#c8d3e0] line-clamp-2 leading-snug">{n.title}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#4a5668]">
                <span>{n.source}</span>
                <span>•</span>
                <span>{n.time} ago</span>
                <span className={`ml-auto font-semibold ${n.sentiment === 'positive' ? 'text-[#00d68f]' : 'text-[#f59e0b]'}`}>
                  {Math.round(n.score * 100)}% positive
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Market Sentiment Indicator
// ───────────────────────────────────────────────────────────
function MarketSentiment() {
  const value = 72; // mock bullish
  const label = value > 60 ? 'Bullish' : value > 40 ? 'Neutral' : 'Bearish';
  const color = value > 60 ? '#00d68f' : value > 40 ? '#f59e0b' : '#ff4d6a';
  const r = 40, cx = 56, cy = 56;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <div className="card p-5 flex items-center gap-5">
      <svg width="112" height="112" viewBox="0 0 112 112" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 1s' }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="18" fontWeight="800">{value}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label.toUpperCase()}</text>
      </svg>
      <div>
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold mb-2">Market Sentiment</p>
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        <p className="text-xs text-[#4a5668] mt-1">FII: +₹647 Cr net buy</p>
        <p className="text-xs text-[#4a5668]">DII: +₹267 Cr net buy</p>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {['NIFTY +0.50%', 'BANKNIFTY +0.50%'].map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[#00d68f]/10 text-[#00d68f] border border-[#00d68f]/15">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Page Component
// ───────────────────────────────────────────────────────────
export default function StockAnalysisPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'RELIANCE').toUpperCase();

  const stock = DEMO_STOCKS.find(s => s.symbol === symbol) || DEMO_STOCKS[0];
  const ai = getAI(symbol);
  const isPositive = stock.change_pct >= 0;

  const [loading, setLoading] = useState(true);
  const prevSymbol = useRef(symbol);

  // Re-trigger loading on symbol change
  useEffect(() => {
    if (prevSymbol.current !== symbol) {
      setLoading(true);
      prevSymbol.current = symbol;
    }
  }, [symbol]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">

      {/* Stock Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-extrabold tracking-tight">{stock.symbol}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              ai.signal === 'BUY' ? 'bg-[#00d68f]/15 text-[#00d68f] border-[#00d68f]/25'
              : ai.signal === 'SELL' ? 'bg-[#ff4d6a]/15 text-[#ff4d6a] border-[#ff4d6a]/25'
              : 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/25'
            }`}>
              AI: {ai.signal}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-[#00d68f] bg-[#00d68f]/10 px-2 py-0.5 rounded-full border border-[#00d68f]/15">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d68f] animate-pulse" />LIVE
            </span>
          </div>
          <p className="text-sm text-[#8b9cb5]">{stock.name} · {stock.sector} · {stock.market_cap}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black">₹{fmt(stock.price)}</div>
          <div className={`text-base font-bold mt-0.5 ${isPositive ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
            {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
          </div>
        </div>
      </motion.div>

      {/* Stock quick nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {DEMO_STOCKS.slice(0, 12).map(s => (
          <Link key={s.symbol} href={`/stocks/${s.symbol}`}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              s.symbol === symbol
                ? 'bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30'
                : 'text-[#4a5668] hover:text-[#8b9cb5] border border-transparent hover:border-[var(--border)]'
            }`}
          >{s.symbol}</Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Chart + Stats + News */}
        <div className="lg:col-span-2 space-y-5">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loader" exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }}>
                <AILoader onDone={() => setLoading(false)} />
              </motion.div>
            ) : (
              <motion.div key="chart" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <PremiumChart stock={stock} ai={ai} />
              </motion.div>
            )}
          </AnimatePresence>

          {!loading && (
            <>
              <MarketSentiment />
              <QuickStats stock={stock} ai={ai} />
              <NewsSentiment stock={stock} />
            </>
          )}
        </div>

        {/* Right: AI Insight Card + Models + Trust */}
        <div className="space-y-5">
          <AnimatePresence>
            {!loading && (
              <>
                <AIInsightCard ai={ai} stock={stock} />
                <ModelBreakdown models={ai.models} />
                <TrustLayer ai={ai} />
              </>
            )}
          </AnimatePresence>

          {loading && (
            <div className="card p-5 space-y-3">
              {[132, 96, 80, 110].map((w, i) => (
                <div key={i} className="skeleton h-4" style={{ width: `${w}px` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
