// @ts-nocheck
'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    notifications: true,
    emailAlerts: false,
    darkMode: true,
    autoRefresh: true,
    refreshInterval: '30',
    riskTolerance: 'moderate',
    currency: 'INR',
    language: 'en',
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
    <motion.div initial="initial" animate="animate" className="space-y-6 max-w-3xl mx-auto">
      <motion.div variants={fadeInUp}>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-dark-300">Configure your AI Stock Platform preferences</p>
      </motion.div>

      {/* General Settings */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.1 }} className="glass-card p-6">
        <h3 className="font-semibold mb-4">⚙️ General</h3>
        <div className="space-y-4">
          {[
            { key: 'notifications', label: 'Push Notifications', desc: 'Receive alerts for buy/sell signals' },
            { key: 'emailAlerts', label: 'Email Alerts', desc: 'Get daily market summary via email' },
            { key: 'darkMode', label: 'Dark Mode', desc: 'Use dark theme (recommended)' },
            { key: 'autoRefresh', label: 'Auto Refresh Data', desc: 'Automatically refresh market data' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-dark-400">{item.desc}</div>
              </div>
              <button
                onClick={() => setSettings({ ...settings, [item.key]: !settings[item.key as keyof typeof settings] })}
                className={`w-11 h-6 rounded-full relative transition-all ${settings[item.key as keyof typeof settings] ? 'bg-accent-blue' : 'bg-dark-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings[item.key as keyof typeof settings] ? 'left-5.5 translate-x-0' : 'left-0.5'}`}
                  style={{ left: settings[item.key as keyof typeof settings] ? '22px' : '2px' }}
                />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Risk Tolerance</div>
              <div className="text-xs text-dark-400">AI will adjust recommendations based on your risk profile</div>
            </div>
            <select
              value={settings.riskTolerance}
              onChange={(e) => setSettings({ ...settings, riskTolerance: e.target.value })}
              className="bg-dark-700 border border-dark-600/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-blue/50"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Refresh Interval</div>
              <div className="text-xs text-dark-400">How often to refresh market data</div>
            </div>
            <select
              value={settings.refreshInterval}
              onChange={(e) => setSettings({ ...settings, refreshInterval: e.target.value })}
              className="bg-dark-700 border border-dark-600/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-blue/50"
            >
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* API Keys */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.2 }} className="glass-card p-6">
        <h3 className="font-semibold mb-2">🔑 API Keys</h3>
        <p className="text-xs text-dark-400 mb-4">Add API keys to enable live market data. The platform works in demo mode without keys.</p>
        <div className="space-y-3">
          {[
            { key: 'finnhub', label: 'Finnhub API Key', placeholder: 'Enter Finnhub API key' },
            { key: 'twelvedata', label: 'TwelveData API Key', placeholder: 'Enter TwelveData API key' },
            { key: 'alphaVantage', label: 'Alpha Vantage API Key', placeholder: 'Enter Alpha Vantage API key' },
            { key: 'openai', label: 'OpenAI API Key', placeholder: 'Enter OpenAI API key for AI assistant' },
          ].map((item) => (
            <div key={item.key}>
              <label className="text-sm font-medium text-dark-200 mb-1 block">{item.label}</label>
              <input
                type="password"
                placeholder={item.placeholder}
                value={apiKeys[item.key as keyof typeof apiKeys]}
                onChange={(e) => setApiKeys({ ...apiKeys, [item.key]: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-dark-700/50 border border-dark-600/50 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-accent-blue/50 transition-all"
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* About */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.3 }} className="glass-card p-6">
        <h3 className="font-semibold mb-2">ℹ️ About</h3>
        <div className="space-y-2 text-sm text-dark-300">
          <div className="flex justify-between"><span>Version</span><span className="text-white">1.0.0</span></div>
          <div className="flex justify-between"><span>Mode</span><span className="text-accent-orange">Demo</span></div>
          <div className="flex justify-between"><span>AI Models</span><span className="text-white">XGBoost, LightGBM, Neural Net, Prophet</span></div>
          <div className="flex justify-between"><span>Stocks Covered</span><span className="text-white">NIFTY 50</span></div>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div variants={fadeInUp} transition={{ delay: 0.4 }}>
        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-xl font-semibold transition-all text-sm ${
            saved
              ? 'bg-accent-green text-white'
              : 'bg-gradient-accent text-white hover:opacity-90 hover:shadow-glow'
          }`}
        >
          {saved ? '✓ Settings Saved' : 'Save Settings'}
        </button>
        <p className="text-xs text-dark-500 text-center mt-2">
          ⚠️ AI analysis is for educational purposes only. Not financial advice.
        </p>
      </motion.div>
    </motion.div>
  );
}
