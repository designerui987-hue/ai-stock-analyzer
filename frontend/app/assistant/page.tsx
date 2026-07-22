'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, Sparkles, ShieldCheck, ArrowRight, CornerDownLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const AI_DATA: Record<string, any> = {
  RELIANCE: {
    signal: 'BUY',
    confidence: 84,
    risk: 'Low',
    entry: 2450,
    target: 2780,
    stopLoss: 2310,
    price: 2487.35,
    reasons: [
      'Strong 18% YoY earnings beat in latest quarterly report',
      'Bullish MACD crossover on daily chart with rising volume',
      'New energy investments creating long-term structural growth',
    ],
  },
  TCS: {
    signal: 'HOLD',
    confidence: 63,
    risk: 'Medium',
    entry: 3800,
    target: 4150,
    stopLoss: 3640,
    price: 3892.5,
    reasons: [
      'Revenue growth moderating due to macro IT spending slowdown',
      'Valuation at 32x P/E slightly elevated vs near-term guidance',
      'Consolidating in tight range — wait for directional breakout',
    ],
  },
  HDFCBANK: {
    signal: 'BUY',
    confidence: 79,
    risk: 'Low',
    entry: 1620,
    target: 1870,
    stopLoss: 1545,
    price: 1645.8,
    reasons: [
      'NIM expansion expected from anticipated RBI monetary easing',
      'Strong 18% loan book growth with pristine credit metrics',
    ],
  },
};

function getAI(symbol: string) {
  return AI_DATA[symbol.toUpperCase()] || null;
}

function extractSymbol(text: string): string | null {
  const upper = text.toUpperCase();
  const known = Object.keys(AI_DATA);
  return known.find((s) => upper.includes(s)) || null;
}

const SUGGESTIONS = [
  'Should I buy Reliance today?',
  'Analyze TCS technical structure',
  'Top stock picks in NIFTY 50',
  'Evaluate HDFC Bank entry price',
];

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  stockCard?: any;
  symbol?: string;
}

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your institutional AI Market Copilot. Ask me to evaluate any stock, analyze technical patterns, or check portfolio risk.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    await new Promise((r) => setTimeout(r, 700));

    const sym = extractSymbol(text);
    if (sym) {
      const ai = getAI(sym);
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Here is the multi-model ensemble analysis for **${sym}**:`,
          stockCard: ai,
          symbol: sym,
        },
      ]);
    } else {
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Based on current market data, the NIFTY 50 index shows strong bullish momentum (+0.50% today). Institutional buying is concentrated in Financials and Auto. Ask me about **RELIANCE**, **TCS**, or **HDFCBANK** for specific stock evaluations!`,
        },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header status bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-btn bg-indigo-600 text-white flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI Market Copilot
            </h2>
            <p className="text-caption text-slate-500">4 Ensemble Models Connected</p>
          </div>
        </div>

        <Badge variant="indigo" size="sm">
          GPT-4o + LightGBM Engine
        </Badge>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
        {msgs.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] space-y-3 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white p-4 rounded-card-lg rounded-tr-none shadow-subtle'
                  : 'bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.06] p-5 rounded-card-lg rounded-tl-none shadow-subtle text-slate-900 dark:text-slate-100'
              }`}
            >
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>

              {/* Embedded Stock Card if symbol matched */}
              {msg.stockCard && msg.symbol && (
                <div className="mt-4 p-4 rounded-btn bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.06] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-base font-semibold">{msg.symbol}</span>
                      <p className="text-caption text-slate-500">
                        ₹{msg.stockCard.price.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={msg.stockCard.signal.toLowerCase() as any} size="md">
                      {msg.stockCard.signal} ({msg.stockCard.confidence}%)
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-caption text-slate-500 font-medium">Key Catalysts</span>
                    {msg.stockCard.reasons.map((r: string, idx: number) => (
                      <p key={idx} className="text-xs text-slate-600 dark:text-slate-300">
                        • {r}
                      </p>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link href={`/stocks/${msg.symbol}`}>
                      <Button variant="outline" size="sm">
                        View Detailed Analysis →
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.06] p-4 rounded-card-lg rounded-tl-none text-slate-400 text-xs flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              <span>Analyzing market telemetry & financial models...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggested Prompts */}
      {msgs.length <= 2 && (
        <div className="flex items-center space-x-2 py-3 overflow-x-auto scrollbar-none shrink-0">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="px-3 py-1.5 rounded-btn bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 transition-all shrink-0"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(input);
            }}
            placeholder="Ask AI Copilot about any stock..."
            className="w-full bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 rounded-input py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2 rounded-btn bg-indigo-600 text-white disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
