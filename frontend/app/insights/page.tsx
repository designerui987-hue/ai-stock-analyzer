'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, Activity, ShieldCheck, ArrowRight, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DEMO_INSIGHTS, DEMO_ALERTS } from '@/lib/data';

export default function InsightsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
            Real-Time AI Market Insights
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automated intelligence stream powered by multi-model ensemble analytics
          </p>
        </div>

        <Badge variant="indigo" size="md">
          Continuous Telemetry Active
        </Badge>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AI Insight Cards Feed */}
        <div className="lg:col-span-2 space-y-4">
          {DEMO_INSIGHTS.map((insight) => (
            <Card key={insight.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant={insight.impact === 'positive' ? 'emerald' : insight.impact === 'negative' ? 'red' : 'amber'} size="sm">
                    {insight.category.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-caption text-slate-400">{insight.time}</span>
                </div>

                <Badge variant="indigo" size="sm">
                  {insight.confidence}% Confidence
                </Badge>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {insight.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {insight.summary}
                </p>
              </div>

              {insight.symbols.length > 0 && (
                <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                  <span className="text-caption text-slate-400">Impacted Assets:</span>
                  {insight.symbols.map((sym) => (
                    <Link key={sym} href={`/stocks/${sym}`}>
                      <Badge variant="neutral" size="sm" className="hover:border-indigo-500 transition-colors">
                        {sym}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Right Column: Market Regime & Sentiment Metrics */}
        <div className="space-y-6">
          {/* Market Regime Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Market Regime
                </h3>
              </div>
            </div>

            <div className="p-4 rounded-btn bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
              <span className="text-h3 font-semibold text-emerald-600 dark:text-emerald-400">
                Bullish Expansion Phase
              </span>
              <p className="text-caption text-slate-600 dark:text-slate-400">
                Broad market breadth with strong institutional net inflow (FII + DII).
              </p>
            </div>
          </Card>

          {/* Sentiment Breakdown */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Sentiment Vector
              </h3>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Institutional Flow', pct: 82, variant: 'emerald' },
                { label: 'News Telemetry', pct: 74, variant: 'indigo' },
                { label: 'Options Put-Call Ratio', pct: 68, variant: 'indigo' },
                { label: 'Retail Sentiment', pct: 54, variant: 'amber' },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      {item.label}
                    </span>
                    <span className="font-semibold">{item.pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
