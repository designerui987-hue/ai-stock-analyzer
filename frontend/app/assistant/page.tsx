'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, Sparkles, AlertCircle, ArrowLeft } from 'lucide-react';
import { api, auth } from '@/lib/api';

const DEFAULT_SUGGESTIONS = [
  'Explain the Reliance trend and momentum trade-off',
  'Why are Indian IT stocks moving together?',
  'What should I check before opening a position?',
  'What are the primary risk factors for HDFC Bank?',
];

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  type?: 'generated' | 'system';
}

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Hello! I am your AI Market Research Companion for Indian equities. Ask me about any NSE company, recent momentum divergence, or quantitative rules.\n\nNotice: All observations are provided for research purposes and do not constitute investment advice.',
      type: 'system',
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
            content: 'Please sign in to communicate with your AI Market Assistant.',
            type: 'system',
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
            type: 'generated',
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
            content: 'Research assistant service returned an empty response. Please try again.',
            type: 'system',
          },
        ]);
      }
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: 'The assistant service is currently unavailable. Deterministic quantitative signals remain active on individual stock pages.',
          type: 'system',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-9rem)] space-y-4">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E1E7E8] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#E3F2ED] text-[#087F73] flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#142B32]">Research Companion</h1>
            <p className="text-xs text-[#687A81]">Contextual research assistant for NSE equities</p>
          </div>
        </div>

        <Link
          href="/stocks"
          className="text-xs text-[#087F73] hover:underline flex items-center gap-1 font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Explore Companies</span>
        </Link>
      </div>

      {/* ── Messages Stream ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {msgs.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] p-4 rounded-[12px] text-xs md:text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#142B32] text-white rounded-tr-none'
                  : msg.type === 'system'
                  ? 'bg-[#FAF3E5] border border-[#EEE2C6] text-[#8B734D] rounded-tl-none'
                  : 'bg-white border border-[#E1E7E8] text-[#142B32] rounded-tl-none shadow-sm'
              }`}
            >
              {msg.type === 'generated' && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#087F73] mb-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Market Intelligence</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#EAF2EC] border border-[#D8E5DE] p-3 rounded-[10px] text-xs text-[#087F73] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#087F73] animate-ping" />
              <span>Analyzing market data &amp; formulating evidence...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Suggested Prompts ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-none shrink-0">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="px-3 py-1.5 rounded-[6px] bg-white border border-[#E1E7E8] text-xs text-[#687A81] hover:text-[#142B32] hover:border-[#CCD7D9] transition-all shrink-0 whitespace-nowrap"
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Input Box ──────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-[#E1E7E8] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about companies, sector moves, or technical observations..."
            className="w-full bg-white border border-[#E1E7E8] text-[#142B32] placeholder:text-[#687A81] rounded-[8px] py-2.5 pl-3.5 pr-12 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#087F73]/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 px-3 py-1.5 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[6px] text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
          >
            <span>Ask</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[#687A81] text-center">
          Deterministic quantitative engine · Not investment advice · NSE Equities
        </p>
      </div>
    </div>
  );
}
