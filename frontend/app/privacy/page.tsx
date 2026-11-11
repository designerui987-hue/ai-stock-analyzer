'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { ShieldCheck, Lock, EyeOff, Key, Database } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4 md:p-8 animate-fade-in text-slate-800 dark:text-slate-200">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-200 dark:border-white/10 pb-6">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Privacy & Security Policy
          </h1>
        </div>
        <p className="text-xs text-slate-500">
          Last Updated: November 2026 · Committed to end-to-end credential encryption and data protection
        </p>
      </div>

      <div className="space-y-6 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-500" />
            1. Zero-Trust Broker Credential Storage
          </h2>
          <p>
            Your broker API secrets and access tokens (e.g., Zerodha Kite access tokens) are <strong>never stored in plaintext</strong>.
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-2">
            <li>All access tokens are encrypted at rest using industry-standard <strong>AES-256-GCM</strong> authenticated encryption.</li>
            <li>Encryption keys are loaded strictly from verified server-side environment variables (<code>TOKEN_ENCRYPTION_SECRET</code>) and are never exposed to browser clients or client bundles.</li>
            <li>Tokens automatically expire daily per Indian broker specifications (07:30 AM IST for Kite) and are discarded upon disconnection.</li>
          </ul>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-500" />
            2. Data Collection & Persistence
          </h2>
          <p>
            We collect and store only data strictly required to deliver our analytical and portfolio services:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-2">
            <li><strong>Account Identifiers:</strong> Hashed email and user ID for authentication. Password hashes are generated using bcrypt with salt rounds.</li>
            <li><strong>Watchlist & Portfolio Holdings:</strong> Stock symbols, target allocations, and trade timestamps stored in PostgreSQL.</li>
            <li><strong>Execution Logs:</strong> Order logs (Paper or Live) stored for auditability, regulatory compliance, and risk analytics.</li>
          </ul>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-indigo-500" />
            3. No Third-Party Data Monetization
          </h2>
          <p>
            We do not sell, rent, monetize, or share your portfolio positions, watchlist preferences, or order histories with third-party advertisers, market makers, or data brokers.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-500" />
            4. Session Security & CSRF Protection
          </h2>
          <p>
            All authenticated API routes derive user identity strictly from cryptographically signed JWT sessions. Requests lacking valid authentication headers receive immediate HTTP 401 rejections. Cron and administrative routes require dedicated <code>CRON_SECRET</code> header authorization.
          </p>
        </Card>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-between items-center text-xs text-slate-500">
        <span>© 2026 AI Stock Analyzer. All rights reserved.</span>
        <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Read Terms of Service →
        </Link>
      </div>
    </div>
  );
}

