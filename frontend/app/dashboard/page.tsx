// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  DEMO_INDICES,
  DEMO_STOCKS,
  DEMO_AI_PICKS,
  DEMO_PORTFOLIO,
  DEMO_ALERTS,
  formatNumber,
} from '@/lib/data';

const anim = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

// ── Market Indices Row ──────────────────────────────────────
function IndexRow() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {DEMO_INDICES.map((idx, i) => {
        const up = idx.change_pct >= 0;
        return (
          <motion.div key={idx.symbol} {...anim(i * 0.05)} className="card card-hover p-4">
            <p className="text-[10px] text-[#8b9cb5] uppercase tracking-widest font-semibold mb-1">{idx.symbol}</p>
            <p className="text-xl font-extrabold text-white">{idx.value.toLocaleString()}</p>
            <p className={`text-sm font-semibold mt-1 ${up ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
              {up ? '▲' : '▼'} {up ? '+' : ''}{idx.change} ({up ? '+' : ''}{idx.change_pct.toFixed(2)}%)
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Market Sentiment Gauge ──────────────────────────────────
function SentimentGauge() {
  const value = 72;
  const label = 'Bullish';
  const color = '#00d68f';
  const r = 44, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <div className="card p-5 h-full">
      <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold mb-3">Market Sentiment</p>
      <div className="flex items-center gap-4">
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="9"
            strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)' }} />
          <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="22" fontWeight="800">{value}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill={color} fontSize="11" fontWeight="700">{label.toUpperCase()}</text>
        </svg>
        <div className="flex-1 space-y-2.5">
          {[
            { label: 'FII Net', value: '+₹647 Cr', color: '#00d68f' },
            { label: 'DII Net', value: '+₹267 Cr', color: '#6366f1' },
            { label: 'PCR', value: '1.12', color: '#f59e0b' },
            { label: 'VIX', value: '13.4', color: '#a855f7' },
          ].map(({ label, value, color: c }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-[#8b9cb5]">{label}</span>
              <span className="font-semibold" style={{ color: c }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Portfolio Summary ───────────────────────────────────────
function PortfolioCard() {
  const p = DEMO_PORTFOLIO;
  const pos = p.total_pnl >= 0;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">💼 Portfolio</p>
        <Link href="/portfolio" className="text-xs text-[#6366f1] hover:text-[#818cf8] font-semibold transition-colors">View All →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Current Value', value: `₹${(p.current_value / 100000).toFixed(2)}L`, color: 'text-white' },
          { label: 'Total P&L', value: `${pos ? '+' : ''}₹${(p.total_pnl / 1000).toFixed(1)}K`, color: pos ? 'text-[#00d68f]' : 'text-[#ff4d6a]' },
          { label: 'Invested', value: `₹${(p.total_invested / 100000).toFixed(2)}L`, color: 'text-[#8b9cb5]' },
          { label: "Today's P&L", value: `${p.day_pnl >= 0 ? '+' : ''}₹${formatNumber(p.day_pnl)}`, color: p.day_pnl >= 0 ? 'text-[#00d68f]' : 'text-[#ff4d6a]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card-surface rounded-xl p-3">
            <p className="text-[10px] text-[#4a5668] mb-1">{label}</p>
            <p className={`text-sm font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-[#8b9cb5]">Total return</span>
        <span className={`font-bold text-base ${pos ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
          {pos ? '+' : ''}{p.total_pnl_pct}%
        </span>
      </div>
    </div>
  );
}

// ── Gainers / Losers ────────────────────────────────────────
function MoversTable({ title, stocks }: { title: string; stocks: any[] }) {
  const isGain = title.includes('Gainer');
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${isGain ? 'bg-[#00d68f]' : 'bg-[#ff4d6a]'}`} />
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">{title}</p>
      </div>
      <div className="space-y-2">
        {stocks.map((s, i) => {
          const up = s.change_pct >= 0;
          return (
            <Link key={s.symbol} href={`/stocks/${s.symbol}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group">
              <span className="text-xs text-[#4a5668] w-4 flex-shrink-0 font-medium">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold group-hover:text-[#818cf8] transition-colors truncate">{s.symbol}</p>
                <p className="text-[10px] text-[#4a5668] truncate">{s.name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold text-white">₹{s.price.toLocaleString()}</p>
                <p className={`text-xs font-bold ${up ? 'text-[#00d68f]' : 'text-[#ff4d6a]'}`}>
                  {up ? '+' : ''}{s.change_pct.toFixed(2)}%
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── AI Stock Picks ──────────────────────────────────────────
const SIG_CLR: Record<string, string> = {
  BUY:  'text-[#00d68f] bg-[#00d68f]/10 border-[#00d68f]/20',
  SELL: 'text-[#ff4d6a] bg-[#ff4d6a]/10 border-[#ff4d6a]/20',
  HOLD: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
};

function AIPicksCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">🤖 AI Picks</p>
        <span className="trust-badge">Live signals</span>
      </div>
      <div className="space-y-2.5">
        {DEMO_AI_PICKS.slice(0, 4).map((pick) => (
          <Link key={pick.symbol} href={`/stocks/${pick.symbol}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold group-hover:text-[#818cf8] transition-colors">{pick.symbol}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SIG_CLR[pick.signal]}`}>{pick.signal}</span>
              </div>
              <p className="text-[10px] text-[#4a5668] mt-0.5 truncate">{pick.reason}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold text-white">{pick.confidence}%</p>
              <p className="text-[10px] text-[#4a5668]">confidence</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Recent Alerts ───────────────────────────────────────────
const ALERT_CLR: Record<string, string> = {
  buy_signal:  'text-[#00d68f] bg-[#00d68f]/10',
  sell_signal: 'text-[#ff4d6a] bg-[#ff4d6a]/10',
  breakout:    'text-[#6366f1] bg-[#6366f1]/10',
  risk_alert:  'text-[#f59e0b] bg-[#f59e0b]/10',
};
const ALERT_ICON: Record<string, string> = {
  buy_signal: '📈', sell_signal: '📉', breakout: '⚡', risk_alert: '⚠️',
};

function AlertsCard() {
  const unread = DEMO_ALERTS.filter(a => !a.read).length;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold">🔔 Alerts</p>
          {unread > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff4d6a]/15 text-[#ff4d6a] border border-[#ff4d6a]/20">{unread}</span>
          )}
        </div>
        <Link href="/insights" className="text-xs text-[#6366f1] hover:text-[#818cf8] font-semibold transition-colors">View All →</Link>
      </div>
      <div className="space-y-2">
        {DEMO_ALERTS.slice(0, 4).map((alert) => (
          <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${alert.read ? 'opacity-50' : 'bg-white/3'}`}>
            <span className={`text-sm px-2 py-1 rounded-lg flex-shrink-0 ${ALERT_CLR[alert.type] || 'text-[#8b9cb5] bg-white/5'}`}>
              {ALERT_ICON[alert.type] || '🔔'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white leading-tight">{alert.title}</p>
              <p className="text-[10px] text-[#4a5668] mt-0.5">{alert.time}</p>
            </div>
            {!alert.read && <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] flex-shrink-0 mt-1.5" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick Search Hero ───────────────────────────────────────
function QuickSearchHero() {
  return (
    <motion.div {...anim(0)} className="card p-6"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))' }}>
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold mb-1">
            What stock should you buy today?
          </h2>
          <p className="text-sm text-[#8b9cb5]">AI analyzes NIFTY 50 stocks in real-time — search any stock for instant signals.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['RELIANCE', 'TCS', 'TATAMOTORS', 'HDFCBANK'].map(sym => (
            <Link key={sym} href={`/stocks/${sym}`}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#6366f1]/30 text-[#818cf8] bg-[#6366f1]/10 hover:bg-[#6366f1]/20 transition-all">
              {sym} →
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Dashboard ───────────────────────────────────────────────
export default function DashboardPage() {
  const sorted = [...DEMO_STOCKS].sort((a, b) => b.change_pct - a.change_pct);
  const gainers = sorted.slice(0, 4);
  const losers  = sorted.slice(-4).reverse();

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">

      <QuickSearchHero />

      {/* Market indices */}
      <IndexRow />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">

          {/* Gainers / Losers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <motion.div {...anim(0.15)}><MoversTable title="Top Gainers" stocks={gainers} /></motion.div>
            <motion.div {...anim(0.2)}><MoversTable title="Top Losers" stocks={losers} /></motion.div>
          </div>

          {/* Portfolio */}
          <motion.div {...anim(0.25)}><PortfolioCard /></motion.div>

          {/* Alerts */}
          <motion.div {...anim(0.3)}><AlertsCard /></motion.div>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-5">
          <motion.div {...anim(0.1)}><SentimentGauge /></motion.div>
          <motion.div {...anim(0.18)}><AIPicksCard /></motion.div>

          {/* Market status */}
          <motion.div {...anim(0.22)} className="card p-5">
            <p className="text-xs text-[#8b9cb5] uppercase tracking-widest font-semibold mb-4">📡 Market Status</p>
            <div className="space-y-3">
              {[
                { label: 'Market', value: '🟢 Open', color: 'text-[#00d68f]' },
                { label: 'Trend', value: '↗ Bullish', color: 'text-[#00d68f]' },
                { label: 'Advances', value: '38/50', color: 'text-white' },
                { label: 'Declines', value: '12/50', color: 'text-[#ff4d6a]' },
                { label: 'A:D Ratio', value: '3.2:1', color: 'text-[#00d68f]' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-[#8b9cb5]">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
