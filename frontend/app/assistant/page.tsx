// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// ── AI Data (shared with stock page logic) ──────────────────
const AI_DATA: Record<string, any> = {
  RELIANCE: { signal: 'BUY', confidence: 84, risk: 'Low', entry: 2450, target: 2780, stopLoss: 2310, upside: 13.4, profitProb: 78, price: 2487.35, change: '+0.05%', reasons: ['Strong 18% YoY earnings growth', 'Bullish MACD crossover with rising volume', 'Green energy investments as long-term catalyst', 'Price holding above 200-day SMA'] },
  TCS: { signal: 'HOLD', confidence: 63, risk: 'Medium', entry: 3800, target: 4150, stopLoss: 3640, upside: 6.6, profitProb: 58, price: 3892.50, change: '-0.60%', reasons: ['Revenue growth moderating from IT slowdown', 'P/E at 32x — slightly elevated vs guidance', 'Strong deal pipeline but uncertainty remains', 'Consolidating — wait for directional breakout'] },
  HDFCBANK: { signal: 'BUY', confidence: 79, risk: 'Low', entry: 1620, target: 1870, stopLoss: 1545, upside: 13.6, profitProb: 73, price: 1645.80, change: '+0.75%', reasons: ['NIM expansion expected from RBI rate cuts', 'Loan book growing at 18% with improving quality', 'RSI at 61 — bullish, not overbought', 'FII net buyers over last 10 sessions'] },
  TATAMOTORS: { signal: 'BUY', confidence: 89, risk: 'Medium', entry: 875, target: 1040, stopLoss: 828, upside: 18.9, profitProb: 81, price: 892.15, change: '+2.01%', reasons: ['JLR sales hitting record quarterly volumes', 'EV transition executing well — market rewarding', 'Volume breakout at ₹870 with 180% surge', 'Debt reduction ahead of schedule'] },
  INFY: { signal: 'BUY', confidence: 71, risk: 'Low', entry: 1540, target: 1720, stopLoss: 1470, upside: 10.2, profitProb: 67, price: 1567.25, change: '+0.56%', reasons: ['Strong deal wins in BFSI and retail verticals', 'Margins stabilising after headcount discipline', 'Price above key moving averages', 'Dividend yield making it attractive for long term'] },
  BHARTIARTL: { signal: 'BUY', confidence: 83, risk: 'Low', entry: 1155, target: 1340, stopLoss: 1092, upside: 16.0, profitProb: 76, price: 1178.90, change: '+2.00%', reasons: ['Subscriber base crossing 400M — market leader', 'ARPU rising every quarter consistently', 'Strong 5G rollout for enterprise contracts', 'Institutional buying detected'] },
  MARUTI: { signal: 'SELL', confidence: 73, risk: 'High', entry: 10876, target: 9800, stopLoss: 11250, upside: -9.9, profitProb: 41, price: 10876.45, change: '-1.14%', reasons: ['RSI at 72 — approaching overbought', 'Margin pressure from rising input costs', 'EV disruption risk growing from competitors', 'Price near 52-week high with fading momentum'] },
};

function getAI(symbol: string) {
  return AI_DATA[symbol.toUpperCase()] || null;
}

function extractSymbol(text: string): string | null {
  const known = Object.keys(AI_DATA);
  const upper = text.toUpperCase();
  return known.find(s => upper.includes(s)) || null;
}

// ── Styling constants ───────────────────────────────────────
const SIG = {
  BUY:  { text: 'text-[#00d68f]', bg: 'bg-[#00d68f]/8 border-[#00d68f]/20', dot: 'bg-[#00d68f]' },
  SELL: { text: 'text-[#ff4d6a]', bg: 'bg-[#ff4d6a]/8 border-[#ff4d6a]/20', dot: 'bg-[#ff4d6a]' },
  HOLD: { text: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/8 border-[#f59e0b]/20', dot: 'bg-[#f59e0b]' },
};
const RISK_CLR: Record<string, string> = {
  Low:    'text-[#00d68f]',
  Medium: 'text-[#f59e0b]',
  High:   'text-[#ff4d6a]',
};

// ── Inline AI Insight Card (chat version) ──────────────────
function ChatInsightCard({ ai, symbol }: { ai: any; symbol: string }) {
  const s = SIG[ai.signal as keyof typeof SIG];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 space-y-4 ${s.bg}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-white text-base">{symbol}</span>
            <span className={`text-2xl font-black ${s.text}`}>{ai.signal}</span>
            <div className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
          </div>
          <p className="text-xs text-[#8b9cb5] mt-0.5">₹{ai.price?.toLocaleString()} · {ai.change}</p>
        </div>
        <Link href={`/stocks/${symbol}`}
          className="text-xs px-3 py-1.5 rounded-xl bg-[#6366f1]/15 text-[#818cf8] border border-[#6366f1]/25 hover:bg-[#6366f1]/25 transition-all font-semibold">
          Full Analysis →
        </Link>
      </div>

      {/* Confidence + Risk row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[10px] text-[#4a5668] mb-1">Confidence</p>
          <p className="text-sm font-bold text-white">{ai.confidence}%</p>
          <div className="mt-1.5 h-1 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#a855f7]" style={{ width: `${ai.confidence}%` }} />
          </div>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[10px] text-[#4a5668] mb-1">Risk</p>
          <p className={`text-sm font-bold ${RISK_CLR[ai.risk]}`}>{ai.risk}</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[10px] text-[#4a5668] mb-1">Profit Prob.</p>
          <p className="text-sm font-bold text-white">{ai.profitProb}%</p>
        </div>
      </div>

      {/* Reasons */}
      <div>
        <p className="text-[10px] text-[#8b9cb5] uppercase tracking-widest font-semibold mb-2">Why {ai.signal}?</p>
        <ul className="space-y-1.5">
          {ai.reasons.slice(0, 3).map((r: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-xs text-[#c8d3e0]">
              <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${s.dot}`} />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Action plan */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Entry', value: ai.entry, color: '#00d68f' },
          { label: 'Target', value: ai.target, color: '#6366f1' },
          { label: 'Stop Loss', value: ai.stopLoss, color: '#ff4d6a' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center rounded-xl p-2" style={{ background: `${color}10`, border: `1px solid ${color}22` }}>
            <p className="text-[10px] text-[#8b9cb5]">{label}</p>
            <p className="text-xs font-bold mt-0.5" style={{ color }}>₹{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#4a5668] leading-relaxed border-t border-white/5 pt-2">
        ⚠️ AI analysis for educational purposes only. Not financial advice.
      </p>
    </motion.div>
  );
}

// ── Text formatter ──────────────────────────────────────────
function MsgContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-[#c8d3e0]"
      dangerouslySetInnerHTML={{
        __html: content
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
          .replace(/\n/g, '<br/>'),
      }}
    />
  );
}

// ── Quick suggestions ───────────────────────────────────────
const SUGGESTIONS = [
  { label: '📈 Should I buy Reliance?', msg: 'Should I buy Reliance?' },
  { label: '📊 Analyze TCS stock', msg: 'Analyze TCS' },
  { label: '🏆 Top stock picks today', msg: 'Best stocks to buy today' },
  { label: '📉 Maruti sell signal?', msg: 'Should I sell Maruti?' },
  { label: '🏦 HDFC Bank analysis', msg: 'Analyze HDFC Bank' },
  { label: '🌐 Market overview', msg: 'Market overview' },
];

// ── Demo text responses ─────────────────────────────────────
function getDemoResponse(text: string): { content: string; stockCard?: any; symbol?: string } {
  const symbol = extractSymbol(text);
  const msg = text.toLowerCase();

  if (symbol) {
    const ai = getAI(symbol);
    return {
      content: `Here's the AI analysis for **${symbol}**. My ensemble of 4 models gives a **${ai.signal}** signal with **${ai.confidence}% confidence**.`,
      stockCard: ai,
      symbol,
    };
  }

  if (msg.includes('best') || msg.includes('top') || msg.includes('pick')) {
    return {
      content: `🏆 **Top AI Picks Today**\n\n**TATAMOTORS** — BUY (89% confidence) — Strong JLR volumes + EV momentum\n**BHARTIARTL** — BUY (83% confidence) — Record subscriber growth\n**RELIANCE** — BUY (84% confidence) — Earnings beat + green energy catalyst\n\nClick any stock name for the full AI Insight Card.`,
    };
  }

  if (msg.includes('market') || msg.includes('nifty') || msg.includes('sensex')) {
    return {
      content: `📊 **Market Overview**\n\n**NIFTY 50:** 22,456 (+0.50%)\n**SENSEX:** 73,987 (+0.51%)\n**BANK NIFTY:** 47,234 (+0.50%)\n\n**Sentiment:** 🟢 Bullish (72/100)\nFII: +₹647 Cr net buy · DII: +₹267 Cr net buy\n\nBroadly positive session. Auto and Telecom leading. Ask me about any specific stock!`,
    };
  }

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return {
      content: `👋 Hello! I'm your **AI Stock Advisor**.\n\nAsk me anything like:\n• **"Should I buy Reliance?"** — Get instant AI signal\n• **"Analyze TCS"** — Full insight card\n• **"Best stocks today"** — Top AI picks\n• **"Market overview"** — Indices & sentiment`,
    };
  }

  return {
    content: `I can analyse any **NIFTY 50 stock** for you. Try:\n• "Should I buy **HDFCBANK**?"\n• "Analyse **INFY** stock"\n• "Is **TATAMOTORS** a good buy?"\n\nI use 4 AI models (XGBoost, LightGBM, Neural Network, Prophet) to generate signals.`,
  };
}

// ── Loading dots ────────────────────────────────────────────
const THINKING = [
  'Analyzing market trends…',
  'Checking fundamentals…',
  'Running AI models…',
];

// ── Main Component ──────────────────────────────────────────
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  stockCard?: any;
  symbol?: string;
}

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: 'assistant',
    content: `👋 I'm your **AI Stock Market Advisor**.\n\nAsk me about any Indian stock to get an instant AI analysis with BUY/HOLD/SELL signal, confidence score, risk level, and action plan.\n\nWhat would you like to know? 🚀`,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkStep, setThinkStep] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setThinkStep(s => (s + 1) % THINKING.length), 600);
    return () => clearInterval(t);
  }, [loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs(m => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    await new Promise(r => setTimeout(r, 900 + Math.random() * 600));

    const { content, stockCard, symbol } = getDemoResponse(text);
    setMsgs(m => [...m, { role: 'assistant', content, stockCard, symbol }]);
    setLoading(false);
    inputRef.current?.focus();
  };

  const showSuggestions = msgs.length <= 1;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-7rem)]">

      {/* Header badge */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
          style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>🤖</div>
        <div>
          <h2 className="font-bold text-sm">AI Stock Advisor</h2>
          <div className="flex items-center gap-1.5 text-[10px] text-[#00d68f]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d68f] animate-pulse" />
            Online · 4 AI models active
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {msgs.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2.5 flex items-center justify-center text-sm mt-0.5"
                style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>🤖</div>
            )}

            <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? '' : ''}`}>
              <div className={`rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'text-sm text-white font-medium'
                  : 'card text-sm'
              }`} style={msg.role === 'user' ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                <MsgContent content={msg.content} />
              </div>

              {/* Inline insight card */}
              {msg.stockCard && msg.symbol && (
                <ChatInsightCard ai={msg.stockCard} symbol={msg.symbol} />
              )}
            </div>
          </motion.div>
        ))}

        {/* Thinking indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm"
                style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>🤖</div>
              <div className="card px-4 py-3 flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-bounce"
                      style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-xs text-[#8b9cb5]">{THINKING[thinkStep]}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex gap-2 flex-wrap py-3 flex-shrink-0">
            {SUGGESTIONS.map(s => (
              <button key={s.msg} onClick={() => send(s.msg)}
                className="text-xs px-3 py-2 rounded-xl card card-hover text-[#8b9cb5] hover:text-white transition-all">
                {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="flex-shrink-0 card p-2 flex items-end gap-2 mt-2"
        style={{ backdropFilter: 'blur(20px)' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder='Ask anything… e.g. "Should I buy Reliance?" or "Analyze TCS"'
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder-[#4a5668] resize-none focus:outline-none min-h-[24px] max-h-32 leading-relaxed py-1.5 px-2"
        />
        <button onClick={() => send(input)} disabled={!input.trim() || loading}
          className="btn-primary px-4 py-2.5 text-sm rounded-xl flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
          {loading ? '⏳' : 'Send →'}
        </button>
      </div>
    </div>
  );
}
