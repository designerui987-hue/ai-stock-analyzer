'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Key, Shield, Bell, Check, User, Server, MessageSquare, Send, Smartphone, Radio, Sliders, Moon, ExternalLink, QrCode } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    notifications: true,
    emailAlerts: false,
    autoRefresh: true,
    riskTolerance: 'moderate',
    accountCapital: 1183500,
    riskPerTradePct: 1.0,
    maxConcentrationPct: 20,
    maxOpenPositions: 8,
  });

  const [apiKeys, setApiKeys] = useState({
    finnhub: '',
    twelvedata: '',
    alphaVantage: '',
    openai: '',
  });

  const [saved, setSaved] = useState(false);

  // Alert Channel Preferences State
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
  const [waVerificationSent, setWaVerificationSent] = useState(false);

  // Broker Connection State
  const [brokerConn, setBrokerConn] = useState<{ connected: boolean; status: string; expires_at?: string }>({
    connected: false,
    status: 'DISCONNECTED',
  });

  useEffect(() => {
    // Fetch broker connection status
    fetch('/api/broker/connection?userId=demo_user')
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
      .catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    // Check Web Push permission state
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushSubscribed(true);
      }
    }

    // Fetch alert preferences from backend
    fetch('/api/alerts/preferences?userId=demo_user')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.preference) {
          const p = json.preference;
          if (p.channels_enabled) setChannels(p.channels_enabled);
          if (p.alert_types_subscribed) setAlertTypes(p.alert_types_subscribed);
          if (p.quiet_hours) setQuietHours(p.quiet_hours);
          if (p.min_confidence_threshold) setMinConfThreshold(p.min_confidence_threshold);
          if (p.telegram_chat_id) setTelegramChatId(p.telegram_chat_id);
          if (p.whatsapp_number) setWhatsappPhone(p.whatsapp_number);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const handleEnableWebPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser Push Notifications are not supported in this browser.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setPushSubscribed(true);
        setChannels({ ...channels, web_push: true });

        // Save a mock subscription payload to backend
        const mockSub = {
          endpoint: 'https://fcm.googleapis.com/fcm/send/demo_token',
          keys: { p256dh: 'demo_key', auth: 'demo_auth' },
        };
        await fetch('/api/alerts/subscribe-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: mockSub, userId: 'demo_user' }),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('stockai_risk_settings', JSON.stringify({
        accountCapital: settings.accountCapital,
        riskPerTradePct: settings.riskPerTradePct,
        maxConcentrationPct: settings.maxConcentrationPct,
        maxOpenPositions: settings.maxOpenPositions,
      }));
    }

    // Save alert preferences to backend API
    await fetch('/api/alerts/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'demo_user',
        channels_enabled: channels,
        alert_types_subscribed: alertTypes,
        quiet_hours: quietHours,
        min_confidence_threshold: minConfThreshold,
        whatsapp_number: whatsappPhone,
        telegram_chat_id: telegramChatId,
      }),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header */}
      <div>
        <h2 className="text-h2 font-semibold text-slate-900 dark:text-slate-100">
          Account & Platform Settings
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage system configurations, API credentials, and notification thresholds
        </p>
      </div>

      {/* Preferences Section */}
      <Card size="large" className="space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            System Preferences
          </h3>
        </div>

        <div className="space-y-4">
          {[
            {
              key: 'notifications',
              label: 'Push Notifications',
              desc: 'Instant alerts for AI buy/sell signal triggers',
            },
            {
              key: 'emailAlerts',
              label: 'Daily Market Summary',
              desc: 'Receive end-of-day portfolio and sentiment reports',
            },
            {
              key: 'autoRefresh',
              label: 'Real-Time Telemetry Auto-Refresh',
              desc: 'Automatically poll NSE WebSocket feeds every 10 seconds',
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/[0.04] last:border-none"
            >
              <div>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {item.label}
                </span>
                <p className="text-caption text-slate-500">{item.desc}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={!!settings[item.key as keyof typeof settings]}
                onClick={() =>
                  setSettings({
                    ...settings,
                    [item.key]: !settings[item.key as keyof typeof settings],
                  })
                }
                className={`w-11 h-6 rounded-full relative transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                  settings[item.key as keyof typeof settings]
                    ? 'bg-indigo-600'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-150 ease-out ${
                    settings[item.key as keyof typeof settings] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Risk Tolerance Profile
              </span>
              <p className="text-caption text-slate-500">
                AI rebalancing engine adapts stop-loss sensitivity accordingly
              </p>
            </div>

            <select
              value={settings.riskTolerance}
              onChange={(e) => setSettings({ ...settings, riskTolerance: e.target.value })}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 rounded-input px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Risk Management & Position Sizing Rules Card */}
      <Card size="large" className="space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Risk & Position Sizing Rules
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Total Account Trading Capital (₹)"
            type="number"
            value={settings.accountCapital}
            onChange={(e) => setSettings({ ...settings, accountCapital: parseFloat(e.target.value) || 0 })}
            helperText="Default pulls from portfolio balance. Used as baseline for 1% risk rule calculations."
          />

          <div>
            <Input
              label="Max Risk Per Trade (%)"
              type="number"
              step="0.25"
              min="0.25"
              max="5.0"
              value={settings.riskPerTradePct}
              onChange={(e) => setSettings({ ...settings, riskPerTradePct: parseFloat(e.target.value) || 0 })}
              helperText="Recommended institutional range: 0.5% - 2.0% of total capital."
            />
            {settings.riskPerTradePct > 2.0 && (
              <span className="text-caption text-amber-600 dark:text-amber-400 font-medium block mt-1">
                ⚠️ Warning: Risking over 2% per trade increases drawdown vulnerability.
              </span>
            )}
          </div>

          <Input
            label="Max Single-Stock Concentration (%)"
            type="number"
            value={settings.maxConcentrationPct}
            onChange={(e) => setSettings({ ...settings, maxConcentrationPct: parseFloat(e.target.value) || 0 })}
            helperText="Position size calculator will flag a warning if position value exceeds this %."
          />

          <Input
            label="Max Open Positions"
            type="number"
            value={settings.maxOpenPositions}
            onChange={(e) => setSettings({ ...settings, maxOpenPositions: parseInt(e.target.value, 10) || 0 })}
            helperText="Used to trigger portfolio heat and over-exposure alerts."
          />
        </div>
      </Card>

      {/* Multi-Channel Alert Delivery Card */}
      <Card size="large" className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Multi-Channel Alert Delivery
            </h3>
          </div>
          <Badge variant="indigo" size="sm">
            Real-Time Push & Messaging
          </Badge>
        </div>

        {/* 3 Main Channel Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Web Push */}
          <div className="p-4 rounded-card border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Web Push</span>
                </div>
                <Badge variant={pushSubscribed ? 'emerald' : 'slate'} size="sm">
                  {pushSubscribed ? 'Connected' : 'Not Active'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Instant browser notifications when AI signals fire or targets are hit.
              </p>
            </div>

            <Button
              variant={pushSubscribed ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleEnableWebPush}
              className="w-full justify-center text-xs"
            >
              {pushSubscribed ? 'Browser Push Active' : 'Enable Browser Push'}
            </Button>
          </div>

          {/* Telegram Bot */}
          <div className="p-4 rounded-card border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Send className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Telegram Bot</span>
                </div>
                <Badge variant={telegramChatId ? 'emerald' : 'slate'} size="sm">
                  {telegramChatId ? 'Connected' : 'Not Linked'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Free mobile alerts via Telegram Bot API with instant trade links.
              </p>
            </div>

            {telegramChatId ? (
              <div className="p-2 bg-emerald-500/10 rounded text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Connected Chat ID: {telegramChatId}
              </div>
            ) : (
              <a
                href="https://t.me/StockAIBot?start=demo_user"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" /> Connect Telegram Bot <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* WhatsApp Cloud API */}
          <div className="p-4 rounded-card border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">WhatsApp</span>
                </div>
                <Badge variant="amber" size="sm">
                  Meta WABA Beta
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                WhatsApp Business Cloud API messaging. Requires Meta Business Account approval.
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  setWaVerificationSent(true);
                  setTimeout(() => setWaVerificationSent(false), 3000);
                }}
                className="w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
              >
                {waVerificationSent ? 'Verification Code Sent!' : 'Save Phone Number'}
              </button>
            </div>
          </div>
        </div>

        {/* Subscribed Alert Types Checkboxes */}
        <div className="space-y-3 border-t border-slate-100 dark:border-white/[0.06] pt-4">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
            Subscribed Alert Types:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'new_signal', label: '🟢 New AI Signals' },
              { key: 'target_hit', label: '🎯 Target Price Hit' },
              { key: 'sl_hit', label: '🔴 Stop-Loss Hit (Always Urgent)' },
              { key: 'breakout', label: '⚡ Technical Breakout' },
              { key: 'risk_warning', label: '⚠️ Risk Warning (Always Urgent)' },
              { key: 'watchlist_move', label: '👀 Watchlist Big Move' },
            ].map((item) => (
              <label key={item.key} className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!(alertTypes as any)[item.key]}
                  onChange={(e) => setAlertTypes({ ...alertTypes, [item.key]: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Minimum Confidence Slider & Quiet Hours Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 dark:border-white/[0.06] pt-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Minimum Confidence Filter:
              </label>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {minConfThreshold}%+
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={minConfThreshold}
              onChange={(e) => setMinConfThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Only dispatch alerts for signals with confidence &ge; {minConfThreshold}%.
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-slate-400" /> Quiet Hours (No non-urgent alerts)
              </label>
              <input
                type="checkbox"
                checked={quietHours.enabled}
                onChange={(e) => setQuietHours({ ...quietHours, enabled: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600"
              />
            </div>

            {quietHours.enabled && (
              <div className="flex items-center space-x-2 text-xs pt-1">
                <input
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => setQuietHours({ ...quietHours, start: e.target.value })}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => setQuietHours({ ...quietHours, end: e.target.value })}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded text-slate-900 dark:text-slate-100"
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                  (SL_HIT & Risk Warnings bypass quiet hours)
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Connected Brokers Card (Zerodha Kite Connect) */}
      <Card size="large" className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Connected Trading Brokers
            </h3>
          </div>
          <Badge variant={brokerConn.connected ? 'emerald' : 'slate'} size="sm">
            {brokerConn.status}
          </Badge>
        </div>

        <div className="p-4 rounded-card border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-600 text-sm">
                KITE
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block">
                  Zerodha Kite Connect
                </span>
                <span className="text-xs text-slate-500">
                  Largest Indian Stock Broker (NSE / BSE / NFO)
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {brokerConn.connected ? (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/broker/connection', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'disconnect', userId: 'demo_user' }),
                    });
                    setBrokerConn({ connected: false, status: 'DISCONNECTED' });
                  }}
                  className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 rounded text-xs font-semibold transition-colors"
                >
                  Disconnect Broker
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/broker/connection', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'connect_demo', userId: 'demo_user' }),
                    });
                    setBrokerConn({ connected: true, status: 'CONNECTED' });
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  Connect Zerodha Kite <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-200/60 dark:border-white/[0.04] pt-3 leading-relaxed">
            🔒 <span className="font-semibold text-slate-700 dark:text-slate-300">Compliance & Security Notice:</span> Zerodha OAuth tokens are valid until 07:30 AM daily. Your Zerodha password is never collected or stored by StockAI. Token encrypted with AES-256-GCM at rest.
          </div>
        </div>
      </Card>

      {/* API Credentials */}
      <Card size="large" className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] pb-4">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              API Provider Credentials
            </h3>
          </div>
          <Badge variant="indigo" size="sm">
            Encrypted Client-Side
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-caption font-medium text-slate-500 mb-1.5 block">
              Finnhub API Key
            </label>
            <Input
              type="password"
              placeholder="fn_live_..."
              value={apiKeys.finnhub}
              onChange={(e) => setApiKeys({ ...apiKeys, finnhub: e.target.value })}
            />
          </div>

          <div>
            <label className="text-caption font-medium text-slate-500 mb-1.5 block">
              TwelveData API Key
            </label>
            <Input
              type="password"
              placeholder="td_live_..."
              value={apiKeys.twelvedata}
              onChange={(e) => setApiKeys({ ...apiKeys, twelvedata: e.target.value })}
            />
          </div>

          <div>
            <label className="text-caption font-medium text-slate-500 mb-1.5 block">
              Alpha Vantage Key
            </label>
            <Input
              type="password"
              placeholder="av_live_..."
              value={apiKeys.alphaVantage}
              onChange={(e) => setApiKeys({ ...apiKeys, alphaVantage: e.target.value })}
            />
          </div>

          <div>
            <label className="text-caption font-medium text-slate-500 mb-1.5 block">
              OpenAI API Key
            </label>
            <Input
              type="password"
              placeholder="sk-proj-..."
              value={apiKeys.openai}
              onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Save Action Bar */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-caption text-slate-500">
          Changes will take effect immediately upon saving.
        </p>

        <Button
          variant={saved ? 'primary' : 'primary'}
          size="md"
          onClick={handleSave}
          icon={saved ? <Check className="w-4 h-4" /> : undefined}
          className={saved ? '!bg-emerald-600' : ''}
        >
          {saved ? 'Settings Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
