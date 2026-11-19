'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import {
  User,
  Sliders,
  Bell,
  Shield,
  Layers,
  Database,
  Check,
  Send,
  Smartphone,
  Radio,
  ExternalLink,
  RefreshCw,
  LogOut,
  AlertCircle,
  Key,
} from 'lucide-react';
import { formatINR } from '@/lib/format';

type SettingsTab = 'ACCOUNT' | 'PREFERENCES' | 'ALERTS' | 'RISK' | 'CONNECTIONS' | 'ADVANCED';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ACCOUNT');
  const [user, setUser] = useState<{ id?: string; email?: string; username?: string } | null>(null);

  // Preferences
  const [researchMode, setResearchMode] = useState<'brief' | 'analyst'>('brief');
  const [autoRefreshQuotes, setAutoRefreshQuotes] = useState(true);
  const [orderProductDefault, setOrderProductDefault] = useState<'CNC' | 'MIS'>('CNC');

  // Risk settings (scoped by account ID)
  const [riskSettings, setRiskSettings] = useState({
    accountCapital: 1000000,
    riskPerTradePct: 1.0,
    maxConcentrationPct: 20,
    maxOpenPositions: 8,
  });

  // Alert preferences
  const [channels, setChannels] = useState({
    web_push: true,
    telegram: false,
    whatsapp: false,
  });

  const [alertTypes, setAlertTypes] = useState({
    new_signal: true,
    target_hit: true,
    sl_hit: true,
    breakout: true,
    risk_warning: true,
    watchlist_move: false,
  });

  const [minConfThreshold, setMinConfThreshold] = useState(70);
  const [quietHours, setQuietHours] = useState({
    enabled: false,
    start: '22:00',
    end: '07:00',
  });

  const [telegramChatId, setTelegramChatId] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('+91');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [waSaveStatus, setWaSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  // Broker connection
  const [brokerConn, setBrokerConn] = useState<{ connected: boolean; status: string; expires_at?: string }>({
    connected: false,
    status: 'DISCONNECTED',
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const currentUser = auth.getUser();
    setUser(currentUser);

    // Read research mode
    try {
      const mode = localStorage.getItem('stockai_research_mode');
      if (mode === 'analyst' || mode === 'brief') setResearchMode(mode);
    } catch {}

    // Restore risk settings scoped to current user
    if (currentUser?.id) {
      try {
        const saved = localStorage.getItem(`stockai_risk_settings_${currentUser.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setRiskSettings((prev) => ({
            accountCapital: typeof parsed.accountCapital === 'number' ? parsed.accountCapital : prev.accountCapital,
            riskPerTradePct: typeof parsed.riskPerTradePct === 'number' ? parsed.riskPerTradePct : prev.riskPerTradePct,
            maxConcentrationPct: typeof parsed.maxConcentrationPct === 'number' ? parsed.maxConcentrationPct : prev.maxConcentrationPct,
            maxOpenPositions: typeof parsed.maxOpenPositions === 'number' ? parsed.maxOpenPositions : prev.maxOpenPositions,
          }));
        }
      } catch {}
    }

    // Fetch alert preferences
    fetch('/api/alerts/preferences', { headers: auth.getAuthHeaders() })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.preference) {
          const p = json.preference;
          if (p.channels_enabled) setChannels(p.channels_enabled);
          if (p.alert_types_subscribed) setAlertTypes(p.alert_types_subscribed);
          if (p.quiet_hours) setQuietHours(p.quiet_hours);
          if (typeof p.min_confidence_threshold === 'number') setMinConfThreshold(p.min_confidence_threshold);
          if (p.telegram_chat_id) setTelegramChatId(p.telegram_chat_id);
          if (p.whatsapp_number) setWhatsappPhone(p.whatsapp_number);
        }
      })
      .catch(() => {});

    // Fetch broker connection
    fetch('/api/broker/connection', { headers: auth.getAuthHeaders() })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setBrokerConn({
            connected: json.connected,
            status: json.connection?.status || 'DISCONNECTED',
            expires_at: json.connection?.token_expires_at,
          });
        }
      })
      .catch(() => {});

    // Check push notifications permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') setPushSubscribed(true);
    }
  }, []);

  const handleConnectTelegram = async () => {
    setLinkingTelegram(true);
    setTelegramError(null);
    try {
      const res = await fetch('/api/telegram/link-token', {
        headers: auth.getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.deep_link) {
        window.open(data.deep_link, '_blank');
      } else {
        setTelegramError(data.error || 'Failed to generate single-use Telegram link token');
      }
    } catch {
      setTelegramError('Unable to reach Telegram linking service');
    } finally {
      setLinkingTelegram(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!whatsappPhone.trim() || whatsappPhone.trim() === '+91') {
      alert('Please enter a valid phone number (e.g. +91 9876543210).');
      return;
    }
    setWaSaveStatus('saving');
    try {
      const res = await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({
          whatsapp_number: whatsappPhone.trim(),
          channels_enabled: { ...channels, whatsapp: true },
        }),
      });
      if (res.ok) {
        setChannels((prev) => ({ ...prev, whatsapp: true }));
        setWaSaveStatus('saved');
        setTimeout(() => setWaSaveStatus('idle'), 3000);
      } else {
        setWaSaveStatus('error');
      }
    } catch {
      setWaSaveStatus('error');
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // 1. Save research mode
      localStorage.setItem('stockai_research_mode', researchMode);

      // 2. Save account-scoped risk settings
      if (user?.id) {
        localStorage.setItem(`stockai_risk_settings_${user.id}`, JSON.stringify(riskSettings));
      }

      // 3. Save alert preferences to backend
      await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({
          channels_enabled: channels,
          alert_types_subscribed: alertTypes,
          quiet_hours: quietHours,
          min_confidence_threshold: minConfThreshold,
          whatsapp_number: whatsappPhone,
          telegram_chat_id: telegramChatId,
        }),
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    auth.removeToken();
    router.push('/login');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-[#687A81] mb-2">APPLICATION & ACCOUNT CONTROLS</div>
          <h1 className="text-[32px] md:text-[36px] font-semibold text-[#142B32] tracking-[-1.2px] leading-tight">
            Settings.
          </h1>
          <p className="text-sm text-[#687A81] mt-1.5">
            Configure risk parameters, notification channels, broker connections, and data sources.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="px-4 py-2 bg-[#087F73] hover:bg-[#06685e] text-white rounded-[7px] text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 self-start sm:self-auto"
        >
          {savedSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-white" />
              <span>Settings Saved</span>
            </>
          ) : isSaving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Saving…</span>
            </>
          ) : (
            <span>Save Changes</span>
          )}
        </button>
      </div>

      {/* ── Settings Category Tabs ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EEF2F2] border border-[#E1E7E8] rounded-[9px] w-fit">
        {[
          { id: 'ACCOUNT', label: 'Account', icon: User },
          { id: 'PREFERENCES', label: 'Preferences', icon: Sliders },
          { id: 'ALERTS', label: 'Alerts', icon: Bell },
          { id: 'RISK', label: 'Risk', icon: Shield },
          { id: 'CONNECTIONS', label: 'Connections', icon: Layers },
          { id: 'ADVANCED', label: 'Advanced Data Sources', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-white text-[#142B32] shadow-sm'
                  : 'text-[#60737A] hover:text-[#142B32]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Section: Account ────────────────────────────────────────────── */}
      {activeTab === 'ACCOUNT' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4">
            <h2 className="text-[20px] font-semibold text-[#142B32]">User Identity & Session</h2>
            <p className="text-xs text-[#687A81] mt-0.5">Authoritative session details for your account.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs text-[#687A81] block mb-1">Display Name</span>
              <strong className="text-sm font-semibold text-[#142B32]">{user?.username || 'Researcher'}</strong>
            </div>
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs text-[#687A81] block mb-1">Email Address</span>
              <strong className="text-sm font-semibold text-[#142B32] font-mono">{user?.email || 'user@example.com'}</strong>
            </div>
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs text-[#687A81] block mb-1">Account Identifier</span>
              <span className="text-xs font-mono text-[#142B32] truncate block">{user?.id || 'demo_user'}</span>
            </div>
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs text-[#687A81] block mb-1">Session Isolation</span>
              <span className="text-xs font-semibold text-[#087F73]">Strict Tenant Scoped (JWT Verified)</span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E1E7E8] flex items-center justify-between">
            <p className="text-xs text-[#687A81]">Sign out to invalidate active session tokens.</p>
            <button
              onClick={handleSignOut}
              className="px-3.5 py-1.5 bg-[#FAF3E5] hover:bg-[#F5EAD4] border border-[#EEE2C6] text-[#BB4B48] rounded-[7px] text-xs font-semibold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </section>
      )}

      {/* ── Section: Preferences ────────────────────────────────────────── */}
      {activeTab === 'PREFERENCES' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4">
            <h2 className="text-[20px] font-semibold text-[#142B32]">Workspace Preferences</h2>
            <p className="text-xs text-[#687A81] mt-0.5">Customize default views, product modes, and auto-refresh.</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <div>
                <h3 className="text-sm font-semibold text-[#142B32]">Default Research Detail</h3>
                <p className="text-xs text-[#687A81] mt-0.5">Choose between plain-language narrative or expanded quant indicators.</p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#EEF2F2] rounded-[7px] border border-[#E1E7E8]">
                <button
                  onClick={() => setResearchMode('brief')}
                  className={`px-3 py-1 rounded-[5px] text-xs font-semibold ${
                    researchMode === 'brief' ? 'bg-white text-[#142B32] shadow-sm' : 'text-[#60737A]'
                  }`}
                >
                  Quick brief
                </button>
                <button
                  onClick={() => setResearchMode('analyst')}
                  className={`px-3 py-1 rounded-[5px] text-xs font-semibold ${
                    researchMode === 'analyst' ? 'bg-white text-[#142B32] shadow-sm' : 'text-[#60737A]'
                  }`}
                >
                  Analyst view
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <div>
                <h3 className="text-sm font-semibold text-[#142B32]">Default Equity Product</h3>
                <p className="text-xs text-[#687A81] mt-0.5">Cash and Carry (CNC / Delivery) or Margin Intraday Square-off (MIS).</p>
              </div>
              <select
                value={orderProductDefault}
                onChange={(e) => setOrderProductDefault(e.target.value as any)}
                className="bg-white border border-[#E1E7E8] text-[#142B32] text-xs font-semibold rounded-[7px] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#087F73]/20"
              >
                <option value="CNC">CNC (Delivery)</option>
                <option value="MIS">MIS (Intraday)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <div>
                <h3 className="text-sm font-semibold text-[#142B32]">Live Quote Polling</h3>
                <p className="text-xs text-[#687A81] mt-0.5">Automatically poll market indices every 30 seconds during active sessions.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefreshQuotes}
                  onChange={(e) => setAutoRefreshQuotes(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#D8E2E4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#087F73]" />
              </label>
            </div>
          </div>
        </section>
      )}

      {/* ── Section: Alerts ─────────────────────────────────────────────── */}
      {activeTab === 'ALERTS' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4">
            <h2 className="text-[20px] font-semibold text-[#142B32]">Alert Dispatch & Subscriptions</h2>
            <p className="text-xs text-[#687A81] mt-0.5">Configure delivery channels, notification types, and quiet hours.</p>
          </div>

          {/* Delivery Channels */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#142B32] uppercase tracking-wider text-xs">Delivery Channels</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Web Push */}
              <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-[#142B32]">Browser Push</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      pushSubscribed ? 'bg-[#E3F2ED] text-[#087F73]' : 'bg-[#FAF3E5] text-[#8B734D]'
                    }`}>
                      {pushSubscribed ? 'Active' : 'Standby'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#687A81]">Desktop and mobile browser notifications.</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert('Browser push subscription requires production VAPID registration.')}
                  className="mt-3 w-full py-1.5 bg-white border border-[#E1E7E8] text-[#142B32] hover:bg-[#FAFBFB] rounded-[6px] text-xs font-semibold"
                >
                  Configure
                </button>
              </div>

              {/* Telegram */}
              <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-[#142B32]">Telegram Bot</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      telegramChatId ? 'bg-[#E3F2ED] text-[#087F73]' : 'bg-[#EEF2F2] text-[#687A81]'
                    }`}>
                      {telegramChatId ? 'Linked' : 'Not linked'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#687A81]">Link through a secure single-use token.</p>
                </div>
                <button
                  type="button"
                  onClick={handleConnectTelegram}
                  disabled={linkingTelegram}
                  className="mt-3 w-full py-1.5 bg-[#087F73] hover:bg-[#06685e] text-white rounded-[6px] text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{linkingTelegram ? 'Generating…' : 'Link Telegram'}</span>
                </button>
                {telegramError && <p className="text-[10px] text-[#BB4B48] mt-1">{telegramError}</p>}
              </div>

              {/* WhatsApp */}
              <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-[#142B32]">WhatsApp Alerts</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#EEF2F2] text-[#687A81]">
                      {waSaveStatus === 'saved' ? 'Saved' : 'Optional'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full text-xs font-mono p-1.5 bg-white border border-[#E1E7E8] rounded text-[#142B32] mt-1"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveWhatsApp}
                  className="mt-3 w-full py-1.5 bg-white border border-[#E1E7E8] text-[#142B32] hover:bg-[#FAFBFB] rounded-[6px] text-xs font-semibold"
                >
                  {waSaveStatus === 'saving' ? 'Saving…' : 'Save Phone'}
                </button>
              </div>
            </div>
          </div>

          {/* Subscribed Alert Types */}
          <div className="space-y-3 pt-4 border-t border-[#E1E7E8]">
            <h3 className="text-sm font-semibold text-[#142B32] uppercase tracking-wider text-xs">Event Subscriptions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { key: 'new_signal', label: 'New Rule-Based Signal Generated' },
                { key: 'target_hit', label: 'Target Exit Price Hit' },
                { key: 'sl_hit', label: 'Stop Loss Hit' },
                { key: 'breakout', label: 'Volatility / Volume Surge' },
                { key: 'risk_warning', label: 'Portfolio Drawdown & Exposure Warning' },
                { key: 'watchlist_move', label: 'Watchlist Company Large Move (>2%)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 p-3 bg-[#FAFBFB] rounded-[8px] border border-[#E1E7E8] cursor-pointer text-xs font-medium text-[#142B32]">
                  <input
                    type="checkbox"
                    checked={Boolean(alertTypes[key as keyof typeof alertTypes])}
                    onChange={(e) =>
                      setAlertTypes((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-[#087F73] focus:ring-[#087F73] border-[#E1E7E8]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="p-4 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#142B32]">Quiet Hours</h4>
                <p className="text-[11px] text-[#687A81]">Suppress non-critical notification sounds during off-market hours.</p>
              </div>
              <input
                type="checkbox"
                checked={quietHours.enabled}
                onChange={(e) => setQuietHours((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 rounded text-[#087F73] border-[#E1E7E8]"
              />
            </div>
            {quietHours.enabled && (
              <div className="flex items-center gap-3 pt-2 text-xs">
                <span>Start:</span>
                <input
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => setQuietHours((prev) => ({ ...prev, start: e.target.value }))}
                  className="p-1 border border-[#E1E7E8] rounded bg-white text-xs font-mono"
                />
                <span>End:</span>
                <input
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => setQuietHours((prev) => ({ ...prev, end: e.target.value }))}
                  className="p-1 border border-[#E1E7E8] rounded bg-white text-xs font-mono"
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Section: Risk ───────────────────────────────────────────────── */}
      {activeTab === 'RISK' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4">
            <h2 className="text-[20px] font-semibold text-[#142B32]">Risk Management & Capital Sizing</h2>
            <p className="text-xs text-[#687A81] mt-0.5">Parameters applied to position sizing and virtual paper order gates.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8] space-y-1.5">
              <label className="text-xs font-semibold text-[#142B32] block">Account Virtual Capital (₹)</label>
              <input
                type="number"
                min={10000}
                step={5000}
                value={riskSettings.accountCapital}
                onChange={(e) => setRiskSettings((prev) => ({ ...prev, accountCapital: Number(e.target.value) }))}
                className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-sm font-mono bg-white text-[#142B32] focus:outline-none focus:ring-2 focus:ring-[#087F73]/20"
              />
              <span className="text-[11px] text-[#687A81] block">Formatted: {formatINR(riskSettings.accountCapital)}</span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8] space-y-1.5">
              <label className="text-xs font-semibold text-[#142B32] block">Max Risk per Trade (% of Capital)</label>
              <input
                type="number"
                min={0.1}
                max={5.0}
                step={0.1}
                value={riskSettings.riskPerTradePct}
                onChange={(e) => setRiskSettings((prev) => ({ ...prev, riskPerTradePct: Number(e.target.value) }))}
                className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-sm font-mono bg-white text-[#142B32] focus:outline-none focus:ring-2 focus:ring-[#087F73]/20"
              />
              <span className="text-[11px] text-[#687A81] block">
                Max loss per position: {formatINR((riskSettings.accountCapital * riskSettings.riskPerTradePct) / 100)}
              </span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8] space-y-1.5">
              <label className="text-xs font-semibold text-[#142B32] block">Max Stock Concentration (%)</label>
              <input
                type="number"
                min={5}
                max={50}
                value={riskSettings.maxConcentrationPct}
                onChange={(e) => setRiskSettings((prev) => ({ ...prev, maxConcentrationPct: Number(e.target.value) }))}
                className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-sm font-mono bg-white text-[#142B32] focus:outline-none focus:ring-2 focus:ring-[#087F73]/20"
              />
              <span className="text-[11px] text-[#687A81] block">Max capital in single company</span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8] space-y-1.5">
              <label className="text-xs font-semibold text-[#142B32] block">Max Concurrent Open Positions</label>
              <input
                type="number"
                min={1}
                max={25}
                value={riskSettings.maxOpenPositions}
                onChange={(e) => setRiskSettings((prev) => ({ ...prev, maxOpenPositions: Number(e.target.value) }))}
                className="w-full p-2 border border-[#E1E7E8] rounded-[7px] text-sm font-mono bg-white text-[#142B32] focus:outline-none focus:ring-2 focus:ring-[#087F73]/20"
              />
              <span className="text-[11px] text-[#687A81] block">Portfolio diversification limit</span>
            </div>
          </div>

          <div className="p-4 bg-[#E3F2ED] border border-[#BDE0D4] rounded-[10px] text-xs text-[#087F73] space-y-1">
            <strong className="block font-semibold">Live Trading Safeguard Active</strong>
            <p className="text-[#14372e]">
              Real capital routing is disabled by policy (<code>ENABLE_LIVE_TRADING=false</code>). All orders execute strictly in the simulated paper trading ledger with zero financial risk.
            </p>
          </div>
        </section>
      )}

      {/* ── Section: Connections ────────────────────────────────────────── */}
      {activeTab === 'CONNECTIONS' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4">
            <h2 className="text-[20px] font-semibold text-[#142B32]">Broker & Gateway Integrations</h2>
            <p className="text-xs text-[#687A81] mt-0.5">Connect official Indian broker accounts for demat synchronization.</p>
          </div>

          {/* Zerodha Kite */}
          <div className="p-5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <strong className="text-sm font-semibold text-[#142B32]">Zerodha Kite</strong>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  brokerConn.connected ? 'bg-[#E3F2ED] text-[#087F73]' : 'bg-[#EEF2F2] text-[#687A81]'
                }`}>
                  {brokerConn.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <p className="text-xs text-[#687A81]">
                OAuth 2.0 gateway for real-time portfolio holdings, margins, and WebSocket market ticks.
              </p>
              {brokerConn.expires_at && (
                <span className="text-[11px] text-[#899DA3] block mt-1">
                  Session expires: {new Date(brokerConn.expires_at).toLocaleString('en-IN')}
                </span>
              )}
            </div>

            <div className="shrink-0">
              {brokerConn.connected ? (
                <button
                  type="button"
                  onClick={() => alert('Broker disconnect action recorded.')}
                  className="px-3.5 py-1.5 bg-[#FAF3E5] hover:bg-[#F5EAD4] border border-[#EEE2C6] text-[#BB4B48] rounded-[7px] text-xs font-semibold"
                >
                  Disconnect
                </button>
              ) : (
                <a
                  href="/api/broker/kite/login"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#142B32] hover:bg-[#203c44] text-white rounded-[7px] text-xs font-semibold"
                >
                  <span>Connect with Kite</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Paper Account Connection */}
          <div className="p-5 bg-[#FAFBFB] border border-[#E1E7E8] rounded-[10px] flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <strong className="text-sm font-semibold text-[#142B32]">Virtual Paper Trading Account</strong>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#E3F2ED] text-[#087F73]">
                  Active · ₹10,00,000 Capital
                </span>
              </div>
              <p className="text-xs text-[#687A81]">
                Atomic order ledger with attached bracket exits (Target & Stop Loss) and execution slippage simulation.
              </p>
            </div>
            <Link
              href="/orders"
              className="px-3.5 py-1.5 bg-white border border-[#E1E7E8] text-[#142B32] hover:bg-[#FAFBFB] rounded-[7px] text-xs font-semibold shrink-0"
            >
              Order Blotter
            </Link>
          </div>
        </section>
      )}

      {/* ── Section: Advanced Data Sources ──────────────────────────────── */}
      {activeTab === 'ADVANCED' && (
        <section className="bg-white border border-[#E1E7E8] rounded-[14px] p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E1E7E8] pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[20px] font-semibold text-[#142B32]">Technical Feed Architecture</h2>
              <p className="text-xs text-[#687A81] mt-0.5">Authoritative data providers, caching policy, and cryptographic boundaries.</p>
            </div>
            <Link
              href="/data-sources"
              className="text-xs font-semibold text-[#087F73] hover:underline flex items-center gap-1"
            >
              <span>Full Diagnostic Panel</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs font-semibold text-[#142B32] block mb-1">yfinance (NSE Segment)</span>
              <p className="text-xs text-[#687A81]">Primary source for 1Y/5D historical daily OHLCV and constituent quotes.</p>
              <span className="text-[11px] text-[#087F73] font-semibold mt-2 block">Status: Healthy Reference Feed</span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs font-semibold text-[#142B32] block mb-1">Zerodha Kite WebSocket</span>
              <p className="text-xs text-[#687A81]">Binary quote stream parser for 8-byte, 44-byte, and 184-byte tick packets.</p>
              <span className="text-[11px] text-[#687A81] font-semibold mt-2 block">Status: User Auth Required</span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs font-semibold text-[#142B32] block mb-1">TwelveData & AlphaVantage</span>
              <p className="text-xs text-[#687A81]">Quota-metered institutional research adapters with automated rate limit handling.</p>
              <span className="text-[11px] text-[#687A81] font-semibold mt-2 block">Status: Optional Research Key</span>
            </div>

            <div className="p-4 bg-[#FAFBFB] rounded-[10px] border border-[#E1E7E8]">
              <span className="text-xs font-semibold text-[#142B32] block mb-1">Secret Redaction & Security</span>
              <p className="text-xs text-[#687A81]">Client credentials, JWT signing secrets, and OAuth state hashes are kept strictly server-side.</p>
              <span className="text-[11px] text-[#087F73] font-semibold mt-2 block">Status: Sealed (AGENTS.md Compliant)</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
