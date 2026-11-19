'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Bot, AlertCircle } from 'lucide-react';
import { api, auth } from '@/lib/api';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'rule-observation' | 'generated' | 'system';
  timestamp?: string;
}

export function ResearchCompanionDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'What would you like to understand? Ask about any NSE company, recent trend, or risk trade-off.',
      type: 'system',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ symbol?: string; question?: string }>;
      setIsOpen(true);
      if (custom.detail?.symbol) {
        setSymbol(custom.detail.symbol);
      }
      if (custom.detail?.question) {
        handleAsk(custom.detail.question);
      }
      setTimeout(() => inputRef.current?.focus(), 150);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('open-assistant-drawer', handleOpen);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('open-assistant-drawer', handleOpen);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleAsk = async (question: string) => {
    if (!question.trim() || loading) return;

    const userMsg: AssistantMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setLastFailedQuestion(null);

    try {
      if (!auth.isAuthenticated()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: 'Please sign in to communicate with your AI Market Assistant.',
            type: 'system',
          },
        ]);
        return;
      }

      // Prepend active company context if relevant
      const outgoingPrompt =
        symbol && !question.toLowerCase().includes(symbol.toLowerCase())
          ? `[Context: ${symbol} NSE] ${question}`
          : question;

      const res = await api.sendMessage(outgoingPrompt);
      if (res && res.response) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.response,
            type: 'generated',
            timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        setLastFailedQuestion(question);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: 'Research assistant service is temporarily unavailable. Please try again shortly.',
            type: 'system',
          },
        ]);
      }
    } catch {
      setLastFailedQuestion(question);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'Unable to connect to the assistant service. Click retry to attempt again.',
          type: 'system',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = symbol
    ? [
        `Explain the ${symbol} trend and momentum trade-off`,
        `What are the primary risk factors for ${symbol}?`,
        `What supporting technical evidence exists for ${symbol}?`,
      ]
    : [
        'Why are Indian IT stocks moving together?',
        'What should I check before opening a position?',
        'Summarize the current market breadth and divergence',
      ];

  if (!isOpen) return null;

  return (
    <>
      <div
        className="drawer-backdrop"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Research companion"
      >
        <div className="p-6 border-b border-[#E1E7E8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#E3F2ED] text-[#087F73] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-semibold text-base text-[#142B32]">Research Companion</h3>
              <p className="text-xs text-[#687A81]">
                {symbol ? `Focus: ${symbol} · NSE` : 'Contextual market intelligence'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-[#687A81] hover:text-[#142B32] rounded-md hover:bg-[#EEF2F2]"
            aria-label="Close research companion"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="space-y-1">
            <div className="eyebrow text-[#687A81]">A LITTLE MORE CONTEXT</div>
            <h2 className="text-[22px] font-semibold text-[#142B32] leading-tight">
              What would you like to investigate?
            </h2>
            <p className="text-sm text-[#687A81]">
              Explore the evidence behind current moves, indicators, and market trade-offs.
            </p>
          </div>

          {/* Contextual suggestions */}
          <div className="grid gap-2 pt-2">
            {suggestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleAsk(q)}
                className="text-left p-3 border border-[#E1E7E8] rounded-[8px] text-xs font-medium text-[#142B32] bg-[#FAFBFB] hover:bg-[#F0F5F3] hover:border-[#CCD7D9] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Conversation history */}
          <div className="pt-4 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-3.5 rounded-[10px] text-sm ${
                  m.role === 'user'
                    ? 'bg-[#142B32] text-white ml-6'
                    : m.type === 'system'
                    ? 'bg-[#FAF3E5] border border-[#EEE2C6] text-[#8B734D] mr-4'
                    : 'bg-[#EAF2EC] border border-[#D8E5DE] text-[#142B32] mr-4'
                }`}
              >
                {m.type === 'generated' && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#087F73] mb-1">
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI Assistant Analysis</span>
                    {m.timestamp && <span className="text-[#687A81] ml-auto">{m.timestamp}</span>}
                  </div>
                )}
                {m.type === 'system' && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8B734D] mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Notice</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed text-xs md:text-sm">{m.content}</p>
              </div>
            ))}
            {loading && (
              <div className="p-3.5 rounded-[10px] bg-[#EAF2EC] border border-[#D8E5DE] mr-4 flex items-center gap-2 text-xs text-[#087F73]">
                <span className="w-2 h-2 rounded-full bg-[#087F73] animate-ping" />
                <span>Formulating research response...</span>
              </div>
            )}
            {lastFailedQuestion && !loading && (
              <div className="flex justify-end pr-4">
                <button
                  type="button"
                  onClick={() => handleAsk(lastFailedQuestion)}
                  className="px-3 py-1.5 bg-[#FAF3E5] hover:bg-[#F5EAD4] border border-[#EEE2C6] text-[#8B734D] rounded-[7px] text-xs font-semibold flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Retry previous question</span>
                </button>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        <div className="p-4 border-t border-[#E1E7E8] bg-white shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(input);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about companies, trends, or risks..."
              className="flex-1 bg-white border border-[#E1E7E8] rounded-[7px] px-3 py-2 text-sm text-[#142B32] placeholder:text-[#687A81] focus:outline-none focus:ring-2 focus:ring-[#087F73]/30"
              maxLength={400}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-[#142B32] hover:bg-[#203c44] text-white px-4 py-2 rounded-[7px] text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <p className="text-[11px] text-[#687A81] mt-2">
            Educational research context. Not investment advice.
          </p>
        </div>
      </section>
    </>
  );
}

export function openResearchCompanion(symbol?: string, question?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('open-assistant-drawer', {
        detail: { symbol, question },
      })
    );
  }
}
