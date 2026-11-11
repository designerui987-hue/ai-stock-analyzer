'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Globe,
  TrendingUp,
  Search,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ProviderStatus {
  provider_id: string;
  display_name: string;
  description: string;
  enabled: boolean;
  status_label: string;
  health: string;
  dev_only: boolean;
  entitlement: string;
  capabilities: string[];
  disabled_features: Record<string, string>;
  market_coverage: string[];
  freshness_policy: string;
  data_frequency: string;
  quota_per_day?: number | null;
  quota_per_minute?: number | null;
  quota_remaining?: number | null;
  quota_is_estimated?: boolean;
  reset_time?: string | null;
  unavailable_reason?: string | null;
  last_refresh?: string | null;
  terms_url: string;
  docs_url?: string;
}

interface ProviderEnvelope<T = any> {
  provider_id: string;
  source: string;
  data: T | null;
  instrument?: string | null;
  currency?: string | null;
  unit?: string | null;
  observation_time?: string | null;
  published_at?: string | null;
  received_at: string;
  status: string;
  unavailable_reason?: string | null;
  freshness: string;
  source_url?: string | null;
  cached?: boolean;
}

type ActiveTab = 'providers' | 'macro_fx' | 'mutual_funds';

const STATUS_BADGE_MAP: Record<string, { label: string; variant: 'emerald' | 'amber' | 'red' | 'indigo' | 'slate' }> = {
  CONNECTED: { label: 'Connected', variant: 'emerald' },
  KEY_REQUIRED: { label: 'Key Required', variant: 'amber' },
  QUOTA_EXHAUSTED: { label: 'Quota Exhausted', variant: 'red' },
  DEV_ONLY: { label: 'Dev Only', variant: 'indigo' },
  UNAVAILABLE: { label: 'Unavailable', variant: 'slate' },
};

function formatIsoTimestamp(iso?: string | null): string {
  if (!iso) return 'Not refreshed yet';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }) + ' IST';
  } catch {
    return iso;
  }
}

export default function DataSourcesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('providers');
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Frankfurter FX state
  const [fxBasket, setFxBasket] = useState<ProviderEnvelope | null>(null);
  const [fxHistory, setFxHistory] = useState<ProviderEnvelope | null>(null);
  const [fxLoading, setFxLoading] = useState(false);

  // World Bank India macro state
  const [macroSummary, setMacroSummary] = useState<ProviderEnvelope | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);

  // Optional Mutual Fund (MFapi) research state
  const [mfQuery, setMfQuery] = useState('HDFC Top 100');
  const [mfResults, setMfResults] = useState<Array<{ schemeCode: number; schemeName: string }>>([]);
  const [mfSearchStatus, setMfSearchStatus] = useState<ProviderEnvelope | null>(null);
  const [mfSearching, setMfSearching] = useState(false);
  const [selectedMfHistory, setSelectedMfHistory] = useState<ProviderEnvelope | null>(null);
  const [mfHistoryLoading, setMfHistoryLoading] = useState(false);

  const loadProviderStatuses = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/data-sources/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProviders(json.providers || []);
    } catch (err: any) {
      setStatusError(err?.message || 'Unable to load provider status from backend');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadFxAndMacro = useCallback(async () => {
    setFxLoading(true);
    setMacroLoading(true);
    try {
      const [basketRes, histRes, macroRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/data-sources/fx/basket`).then((r) => r.json()).catch(() => null),
        fetch(`${BACKEND_URL}/api/data-sources/fx/history?from_currency=USD&to_currency=INR&days=30`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(`${BACKEND_URL}/api/data-sources/macro/india`).then((r) => r.json()).catch(() => null),
      ]);
      setFxBasket(basketRes);
      setFxHistory(histRes);
      setMacroSummary(macroRes);
      // Refresh provider status to reflect latest refresh timestamps
      loadProviderStatuses();
    } finally {
      setFxLoading(false);
      setMacroLoading(false);
    }
  }, [loadProviderStatuses]);

  const handleMfSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (mfQuery.trim().length < 2) return;
    setMfSearching(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/data-sources/mf/search?q=${encodeURIComponent(mfQuery.trim())}`
      );
      const json: ProviderEnvelope = await res.json();
      setMfSearchStatus(json);
      setMfResults(json.data?.results || []);
    } catch {
      setMfResults([]);
    } finally {
      setMfSearching(false);
    }
  }, [mfQuery]);

  const handleLoadMfNav = useCallback(async (schemeCode: number) => {
    setMfHistoryLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/data-sources/mf/${schemeCode}?days=30`);
      const json: ProviderEnvelope = await res.json();
      setSelectedMfHistory(json);
      loadProviderStatuses();
    } finally {
      setMfHistoryLoading(false);
    }
  }, [loadProviderStatuses]);

  useEffect(() => {
    loadProviderStatuses();
  }, [loadProviderStatuses]);

  useEffect(() => {
    if (activeTab === 'macro_fx' && !fxBasket && !macroSummary) {
      loadFxAndMacro();
    }
    if (activeTab === 'mutual_funds' && mfResults.length === 0 && !mfSearchStatus) {
      handleMfSearch();
    }
  }, [activeTab, fxBasket, macroSummary, loadFxAndMacro, mfResults.length, mfSearchStatus, handleMfSearch]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Data Sources & Supplemental Research
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Provider capability registry, server-side key status, reference FX rates, macro context, and optional MF NAV research.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={loadProviderStatuses}
          icon={<RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh Status
        </Button>
      </div>

      {/* Trading Separation Notice */}
      <div className="p-3.5 rounded-card border border-amber-500/20 bg-amber-500/[0.06] flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="font-semibold">Workflow Isolation:</span> External research providers listed here are kept
          strictly separate from live NSE market feeds and order execution. Reference rates, annual macro indicators,
          and end-of-day data cannot be promoted to <code className="font-mono">LIVE</code>. Past performance is not
          indicative of future results. Not investment advice.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-white/[0.06] pb-3">
        {[
          { id: 'providers' as ActiveTab, label: 'Provider Settings & Quotas', icon: Database },
          { id: 'macro_fx' as ActiveTab, label: 'Reference FX & India Macro', icon: Globe },
          { id: 'mutual_funds' as ActiveTab, label: 'Mutual Fund NAV (Optional)', icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-btn text-xs font-semibold transition-colors ${
              activeTab === id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Data Sources Settings Panel */}
      {activeTab === 'providers' && (
        <div className="space-y-6">
          {statusError && (
            <Card className="border-red-500/30 bg-red-500/5">
              <p className="text-xs text-red-500 font-medium">
                Failed to load provider registry: {statusError}
              </p>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {providers.map((p) => {
              const badgeCfg = STATUS_BADGE_MAP[p.status_label] || STATUS_BADGE_MAP.UNAVAILABLE;
              const disabledEntries = Object.entries(p.disabled_features || {});
              return (
                <Card key={p.provider_id} className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {p.display_name}
                          </h3>
                          <Badge variant={badgeCfg.variant} size="sm">
                            {badgeCfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {p.description}
                        </p>
                      </div>
                      <FreshnessBadge status={p.freshness_policy} />
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/[0.04] text-xs">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Data Frequency</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {p.data_frequency}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Last Successful Refresh</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatIsoTimestamp(p.last_refresh)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Remaining Quota {p.quota_is_estimated ? '(Estimated)' : ''}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {p.quota_per_day != null
                            ? `${p.quota_remaining ?? p.quota_per_day} / ${p.quota_per_day} per day`
                            : 'Fair use (no fixed cap)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Reset / Rate Limit</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {p.quota_per_minute ? `${p.quota_per_minute}/min` : 'No fixed min limit'}
                          {p.reset_time ? ` • Resets UTC 00:00` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Enabled Capabilities */}
                    <div>
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                        Enabled Capabilities
                      </span>
                      {p.enabled && p.capabilities.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {p.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {cap}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          Disabled: {p.unavailable_reason || 'No capabilities enabled for current tier'}
                        </p>
                      )}
                    </div>

                    {/* Disabled / Restricted Features */}
                    {disabledEntries.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide block">
                          Disabled / Restricted Features
                        </span>
                        {disabledEntries.map(([feat, reason]) => (
                          <div key={feat} className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>
                              <code className="font-mono text-slate-700 dark:text-slate-300">{feat}</code>: {reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Links */}
                  <div className="pt-3 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400">
                    <span>Coverage: {p.market_coverage.join(', ')}</span>
                    <a
                      href={p.terms_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-500 hover:underline font-medium"
                    >
                      Terms <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Reference FX & India Macro */}
      {activeTab === 'macro_fx' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadFxAndMacro}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${fxLoading || macroLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh Reference FX & Macro
            </Button>
          </div>

          {/* Frankfurter FX Reference Card */}
          <Card size="large" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Currency Reference Rates (Frankfurter / ECB)
                </h3>
                <p className="text-xs text-slate-500">
                  Effective Date:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {fxBasket?.observation_time || 'Unavailable'}
                  </span>{' '}
                  • Labelled REFERENCE RATE — not executable FX prices
                </p>
              </div>
              <FreshnessBadge status={fxBasket?.freshness || 'UNAVAILABLE'} source="frankfurter" />
            </div>

            {fxBasket?.status === 'ok' && fxBasket.data?.rates_to_inr ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {fxBasket.data.rates_to_inr.map((item: { pair: string; rate: number }) => (
                  <div
                    key={item.pair}
                    className="p-3.5 rounded-card bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/[0.05]"
                  >
                    <span className="text-[11px] font-medium text-indigo-500 uppercase tracking-wide block">
                      REFERENCE RATE
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{item.pair}</p>
                    <p className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                      ₹{item.rate.toFixed(4)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {fxBasket?.unavailable_reason || (fxLoading ? 'Loading ECB reference rates...' : 'FX reference rates unavailable.')}
              </p>
            )}

            {fxHistory?.status === 'ok' && Array.isArray(fxHistory.data?.history) && (
              <div className="pt-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                  USD/INR Recent Reference Context (Last {fxHistory.data.history.length} ECB business fixes)
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {fxHistory.data.history.slice(-8).map((pt: { date: string; rate: number }) => (
                    <div
                      key={pt.date}
                      className="shrink-0 px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/[0.06] text-[11px]"
                    >
                      <span className="text-slate-400 block">{pt.date}</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        ₹{pt.rate.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* World Bank India Macro Research Panel */}
          <Card size="large" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  India Macroeconomic Research Panel (World Bank Open Data)
                </h3>
                <p className="text-xs text-slate-500">
                  Annual &amp; revised economic indicators (CC BY 4.0) — NOT intraday trading signals.
                </p>
              </div>
              <FreshnessBadge status={macroSummary?.freshness || 'UNAVAILABLE'} source="worldbank" />
            </div>

            {macroSummary?.status === 'ok' && macroSummary.data?.indicators ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(macroSummary.data.indicators).map((ind: any) => {
                  const latest = ind.observations?.[0];
                  return (
                    <div
                      key={ind.indicator_code}
                      className="p-4 rounded-card bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/[0.05] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ind.indicator_name}
                        </span>
                        <Badge variant="neutral" size="sm">
                          {latest?.period || 'N/A'}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                        {latest?.value != null ? latest.value.toLocaleString('en-IN') : 'N/A'}
                        <span className="text-xs font-normal text-slate-400 ml-1.5">{ind.unit}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {ind.description}
                      </p>
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 dark:border-white/[0.04]">
                        Source: World Bank • Period: {latest?.period || 'N/A'} • Updated: {ind.last_updated || 'N/A'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {macroSummary?.unavailable_reason || (macroLoading ? 'Loading India macroeconomic indicators...' : 'Macro data unavailable.')}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: Optional Mutual Fund NAV Research */}
      {activeTab === 'mutual_funds' && (
        <div className="space-y-6">
          <Card size="large" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Mutual Fund Scheme Search &amp; Historical NAV (MFapi / AMFI)
                </h3>
                <p className="text-xs text-slate-500">
                  Optional research tab outside the equity trading path. NAV dates are explicitly reported as provided.
                </p>
              </div>
              <FreshnessBadge status="NAV" source="mfapi" />
            </div>

            <form onSubmit={handleMfSearch} className="flex gap-2">
              <input
                type="text"
                value={mfQuery}
                onChange={(e) => setMfQuery(e.target.value)}
                placeholder="Search mutual fund scheme (e.g. HDFC, SBI, Nifty 50 Index)..."
                className="flex-1 px-3 py-2 text-xs rounded-input bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <Button type="submit" size="sm" icon={<Search className="w-3.5 h-3.5" />}>
                {mfSearching ? 'Searching...' : 'Search'}
              </Button>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Scheme List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {mfResults.length > 0 ? (
                  mfResults.map((scheme) => (
                    <button
                      key={scheme.schemeCode}
                      type="button"
                      onClick={() => handleLoadMfNav(scheme.schemeCode)}
                      className="w-full text-left p-3 rounded-card border border-slate-200 dark:border-white/[0.06] hover:border-indigo-500/40 bg-slate-50/50 dark:bg-slate-900/50 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {scheme.schemeName}
                      </p>
                      <span className="text-[11px] font-mono text-slate-400">
                        Scheme Code: {scheme.schemeCode}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    {mfSearchStatus?.unavailable_reason || (mfSearching ? 'Searching schemes...' : 'Enter at least 2 characters to search AMFI schemes.')}
                  </p>
                )}
              </div>

              {/* Selected Scheme NAV History */}
              <div className="p-4 rounded-card border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-900/60">
                {mfHistoryLoading ? (
                  <p className="text-xs text-slate-500">Loading historical NAV...</p>
                ) : selectedMfHistory?.status === 'ok' && selectedMfHistory.data ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {selectedMfHistory.data.scheme_name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {selectedMfHistory.data.fund_house} • {selectedMfHistory.data.scheme_category}
                        </p>
                      </div>
                      <FreshnessBadge status={selectedMfHistory.freshness} source="mfapi" />
                    </div>

                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold font-mono text-teal-500">
                        ₹{Number(selectedMfHistory.data.latest_nav).toFixed(4)}
                      </span>
                      <span className="text-xs text-slate-500">
                        NAV as of <strong className="text-slate-700 dark:text-slate-200">{selectedMfHistory.observation_time}</strong>
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto divide-y divide-slate-200/60 dark:divide-white/[0.04] text-xs">
                      {(selectedMfHistory.data.history || []).slice(0, 15).map((row: { date: string; nav: number }) => (
                        <div key={row.date} className="py-1.5 flex justify-between font-mono">
                          <span className="text-slate-500">{row.date}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            ₹{row.nav.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {selectedMfHistory?.unavailable_reason || 'Select a scheme on the left to inspect its latest and historical NAV.'}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Freshness Policy Legend */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-indigo-500" />
          Data Freshness Labels
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="LIVE" /> Verified exchange tick stream</span>
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="DELAYED" /> Delayed quotes / delayed news</span>
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="END_OF_DAY" /> Daily EOD or annual macro release</span>
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="REFERENCE_RATE" /> Central bank benchmark (non-executable)</span>
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="NAV" /> Daily mutual fund NAV (date-explicit)</span>
          <span className="inline-flex items-center gap-1.5"><FreshnessBadge status="UNAVAILABLE" /> Missing key, quota hit, or offline</span>
        </div>
      </Card>
    </div>
  );
}

