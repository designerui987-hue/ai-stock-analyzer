// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { DEMO_INSIGHTS, DEMO_ALERTS } from '@/lib/data';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const impactColors: Record<string, string> = {
  positive: 'border-accent-green/20 bg-accent-green/5',
  negative: 'border-accent-red/20 bg-accent-red/5',
  neutral: 'border-accent-orange/20 bg-accent-orange/5',
};

const categoryIcons: Record<string, string> = {
  sector_rotation: '🔄',
  macro_event: '🏦',
  fundamental: '📊',
  risk_alert: '⚠️',
};

export default function InsightsPage() {
  return (
    <motion.div initial="initial" animate="animate" className="space-y-6 max-w-[1600px] mx-auto">
      <motion.div variants={fadeInUp}>
        <h2 className="text-lg font-semibold">AI Market Insights</h2>
        <p className="text-sm text-dark-300">AI-generated analysis and market signals updated in real-time</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Insights Feed */}
        <motion.div variants={fadeInUp} transition={{ delay: 0.1 }} className="lg:col-span-2 space-y-4">
          {DEMO_INSIGHTS.map((insight, i) => (
            <motion.div
              key={insight.id}
              variants={fadeInUp}
              transition={{ delay: 0.1 + i * 0.05 }}
              className={`glass-card p-6 border ${impactColors[insight.impact]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{categoryIcons[insight.category] || '🧠'}</span>
                  <div>
                    <h3 className="font-semibold text-sm">{insight.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-dark-400 mt-0.5">
                      <span>{insight.time}</span>
                      <span>•</span>
                      <span className="capitalize">{insight.category.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-dark-300">Confidence:</span>
                  <span className="font-bold text-accent-blue">{insight.confidence}%</span>
                </div>
              </div>

              <p className="text-sm text-dark-200 mb-3">{insight.summary}</p>

              {insight.symbols.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-dark-400">Related:</span>
                  {insight.symbols.map((sym) => (
                    <Link
                      key={sym}
                      href={`/stocks/${sym}`}
                      className="text-xs px-2 py-1 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                    >
                      {sym}
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* Sidebar */}
        <motion.div variants={fadeInUp} transition={{ delay: 0.2 }} className="space-y-6">
          {/* Market Regime */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">🎯 Market Regime</h3>
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-green/10 border border-accent-green/20">
                <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                <span className="text-sm font-bold text-accent-green">Bull Market</span>
              </div>
            </div>
            <p className="text-xs text-dark-300 text-center">
              Markets are in an uptrend with strong buying pressure and positive sentiment. Confidence: 78%
            </p>
          </div>

          {/* Recent Alerts */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">🔔 Recent Alerts</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-red/15 text-accent-red font-bold">
                {DEMO_ALERTS.filter((a) => !a.read).length} new
              </span>
            </div>
            <div className="space-y-2">
              {DEMO_ALERTS.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl text-sm transition-colors ${
                    alert.read ? 'opacity-50' : 'bg-dark-700/30'
                  }`}
                >
                  <div className="font-medium text-xs">{alert.title}</div>
                  <div className="text-xs text-dark-400 mt-1">{alert.time}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sentiment Score */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">📈 Sentiment Score</h3>
            <div className="space-y-3">
              {[
                { label: 'News Sentiment', value: 72, color: 'bg-accent-green' },
                { label: 'Social Media', value: 65, color: 'bg-accent-blue' },
                { label: 'Institutional', value: 80, color: 'bg-accent-purple' },
                { label: 'Retail', value: 58, color: 'bg-accent-orange' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-dark-300">{item.label}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
