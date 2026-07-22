'use client';

import React, { useState } from 'react';
import { Settings, Key, Shield, Bell, Check, User, Server } from 'lucide-react';
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
  });

  const [apiKeys, setApiKeys] = useState({
    finnhub: '',
    twelvedata: '',
    alphaVantage: '',
    openai: '',
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
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
                onClick={() =>
                  setSettings({
                    ...settings,
                    [item.key]: !settings[item.key as keyof typeof settings],
                  })
                }
                className={`w-11 h-6 rounded-full relative transition-colors duration-150 ease-out ${
                  settings[item.key as keyof typeof settings]
                    ? 'bg-indigo-600'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-150 ease-out ${
                    settings[item.key as keyof typeof settings] ? 'left-6' : 'left-1'
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
