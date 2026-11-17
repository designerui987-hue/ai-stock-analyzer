'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { api, auth } from '@/lib/api';

const DEFAULT_SUGGESTIONS = [
  'Should I buy Reliance today?',
  'Analyze TCS stock in detail',
  'Top AI stock picks for today',
  'Market overview',
];

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hello! I am your AI Market Assistant for Indian equities. Ask me about any NIFTY 50 stock, deterministic quantitative signals, or market overview.\n\n*Notice: All analytics provided are for educational purposes and do not constitute investment advice.*",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      if (!auth.isAuthenticated()) {
        setMsgs((m) => [
          ...m,
          {
            role: 'assistant',
            content: '⚠️ Please sign in to communicate with the AI Market Assistant.',
          },
        ]);
        return;
      }

      const res = await api.sendMessage(text);
      if (res && res.response) {
        setMsgs((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.response,
          },
        ]);
        if (Array.isArray(res.suggestions) && res.suggestions.length > 0) {
          setSuggestions(res.suggestions);
        }
      } else {
        setMsgs((m) => [
          ...m,
          {
            role: 'assistant',
            content: 'Received an empty response from market assistant service.',
          },
        ]);
      }
    } catch (err: any) {
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: 'The assistant service is currently unavailable. Deterministic quantitative signals remain active on individual stock pages.',
        },
      ]);
    } finally {
      setLoading(false);
    }
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
            <p className="text-caption text-slate-500">Deterministic Quant Engine (v1.0)</p>
          </div>
        </div>

        <Badge variant="indigo" size="sm">
          Deterministic Signals v1.0
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
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.06] p-4 rounded-card-lg rounded-tl-none text-slate-400 text-xs flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              <span>Analyzing market data &amp; generating deterministic signal response...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggested Prompts */}
      <div className="flex items-center space-x-2 py-3 overflow-x-auto scrollbar-none shrink-0">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="px-3 py-1.5 rounded-btn bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.06] text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 transition-all shrink-0"
          >
            {s}
          </button>
        ))}
      </div>

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
            placeholder="Ask AI Copilot about any NIFTY 50 stock..."
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
        <p className="mt-1.5 text-[11px] text-slate-400 text-center">
          Not investment advice • Indian equities (NSE) • Deterministic quant engine
        </p>
      </div>
    </div>
  );
}
