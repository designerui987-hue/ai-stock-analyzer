'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { ShieldAlert, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4 md:p-8 animate-fade-in text-slate-800 dark:text-slate-200">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-200 dark:border-white/10 pb-6">
        <div className="flex items-center space-x-2">
          <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Terms of Service & Regulatory Disclaimers
          </h1>
        </div>
        <p className="text-xs text-slate-500">
          Last Updated: November 2026 · Governing Law: India / SEBI Guidelines
        </p>
      </div>

      {/* Mandatory SEBI Disclaimer Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl space-y-2 text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
        <div className="flex items-center space-x-2 font-bold text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>IMPORTANT REGULATORY DISCLOSURE (SEBI)</span>
        </div>
        <p>
          <strong>AI Stock Analyzer</strong> is an automated financial research, analytics, and data visualization software tool. We are <strong>NOT a SEBI-registered Research Analyst (RA)</strong>, <strong>Investment Adviser (IA)</strong>, or portfolio management service.
        </p>
        <p>
          All quantitative signals, indicators, model outputs, price projections, and backtested metrics provided across this platform are generated via deterministic algorithms and computational heuristics for <strong>educational and analytical purposes only</strong>.
        </p>
      </div>

      {/* Terms Content Cards */}
      <div className="space-y-6 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            1. Not Investment Advice
          </h2>
          <p>
            No content, signal, metric, or calculation provided by this application constitutes financial, investment, legal, tax, or accounting advice. You agree that any investment, trade, or capital allocation decision you make is solely your own independent responsibility. Always consult a certified SEBI-registered financial planner or advisor before risking actual capital in Indian equity and derivative markets.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            2. Market & Algorithmic Risk Disclosures
          </h2>
          <p>
            Securities trading involves substantial risk of financial loss. Past performance, whether verified on historical data or simulated through quantitative backtesting, is <strong>not indicative or predictive of future performance</strong>.
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-2">
            <li>Algorithmic signals may experience prolonged drawdown during volatile market regimes, news shocks, or unexpected circuit breaks.</li>
            <li>Historical backtesting accounts for simulated slippage and standard transaction friction, but live market conditions may exhibit wider bid-ask spreads, liquidity gaps, or exchange outages.</li>
            <li>Derivative (Futures & Options / MIS) trading carries severe leverage risk where losses may exceed starting capital.</li>
          </ul>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            3. Broker Integration & Paper Trading Default
          </h2>
          <p>
            By default, all order execution actions on this platform operate in <strong>Paper Trading Mode</strong>. Virtual paper trading simulates live orders at real market quotes without committing financial capital.
          </p>
          <p>
            Live broker execution (via Zerodha Kite Connect or supported brokers) requires explicit, affirmative per-user opt-in and confirmation modals. The user assumes full responsibility for any API credentials, API secret rotation, order quantities, and order execution results.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            4. Limitation of Liability
          </h2>
          <p>
            Under no circumstances shall the operators, contributors, or developers of AI Stock Analyzer be held liable for any direct, indirect, incidental, punitive, or consequential damages resulting from the use or inability to use the platform, including but not limited to trading losses, broker API disconnections, data feed delays, or execution errors.
          </p>
        </Card>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-between items-center text-xs text-slate-500">
        <span>© 2026 AI Stock Analyzer. All rights reserved.</span>
        <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Read Privacy Policy →
        </Link>
      </div>
    </div>
  );
}

