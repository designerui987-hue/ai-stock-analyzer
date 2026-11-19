'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  Activity,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '@/store/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = () => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    setError('');

    if (!email.trim()) {
      setEmailError('Email address is required.');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setError('');

    try {
      const ok = await login(email, password);
      if (ok) {
        const searchParams = new URLSearchParams(window.location.search);
        const next = new URL(searchParams.get('next') || '/dashboard', window.location.origin);
        const target = next.origin === window.location.origin && !next.pathname.startsWith('//')
          ? next.pathname + next.search + next.hash
          : '/dashboard';
        router.push(target);
      } else {
        setError('Invalid email or password.');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#F5F7F7] text-[#142B32] antialiased">
      {/* ── Left Side (40% Desktop): Brand & Value Proposition ────── */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-12 relative overflow-hidden bg-[#142C33] text-[#c2ced0] border-r border-[#203c44]">
        {/* Top: Logo & Name */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3 text-white font-semibold text-2xl tracking-[-0.6px]">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#b6e6c9] text-[#14372e] flex items-center justify-center font-bold text-sm shrink-0">
              <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 17V9m5 8V5m5 12v-6m5 6V3" />
              </svg>
            </div>
            <span>
              stockai<span className="text-[#a7d7bd]">.</span>
            </span>
          </div>

          <div className="mt-12 space-y-3">
            <h1 className="text-[32px] font-semibold text-white tracking-[-1px] leading-tight">
              A clearer market perspective.
            </h1>
            <p className="text-sm text-[#b6c7ca] leading-relaxed">
              Understand what changed, why it matters, and what deserves deeper research. A daily market brief with evidence a click away.
            </p>
          </div>
        </div>

        {/* Middle: Concise Feature Highlights */}
        <div className="relative z-10 space-y-6 my-8">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-[8px] bg-[#203c44] text-[#a7d7bd] shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Daily Market Brief
              </h3>
              <p className="text-xs text-[#899DA3] mt-0.5 leading-relaxed">
                Clear takeaways on sector moves and divergence without reading every indicator.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-[8px] bg-[#203c44] text-[#a7d7bd] shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Evidence &amp; Counterpoints
              </h3>
              <p className="text-xs text-[#899DA3] mt-0.5 leading-relaxed">
                Deterministic rule agreement and balanced risk counterpoints for every observation.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-[8px] bg-[#203c44] text-[#a7d7bd] shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Research Companion
              </h3>
              <p className="text-xs text-[#899DA3] mt-0.5 leading-relaxed">
                Contextual intelligence drawer to investigate companies and portfolio fit.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Context */}
        <div className="relative z-10 pt-6 border-t border-[#304951] text-xs text-[#899DA3]">
          <span>NSE Equities · Real-time market telemetry</span>
        </div>
      </div>

      {/* ── Right Side (60% Desktop): Centered Auth Card ────────────── */}
      <div className="flex-1 flex flex-col justify-between items-center p-6 sm:p-12 overflow-y-auto">
        {/* Mobile Header Logo */}
        <div className="lg:hidden w-full max-w-[460px] flex items-center space-x-3 mb-6">
          <div className="w-[30px] h-[30px] rounded-[8px] bg-[#b6e6c9] text-[#14372e] flex items-center justify-center font-bold text-xs shrink-0">
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17V9m5 8V5m5 12v-6m5 6V3" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-[#142B32]">
            stockai<span className="text-[#087F73]">.</span>
          </span>
        </div>

        <div className="w-full flex-1 flex items-center justify-center">
          <div className="w-full max-w-[460px] bg-white dark:bg-[#121826] border border-[#E5E7EB] dark:border-white/[0.08] rounded-[20px] p-8 sm:p-10 shadow-subtle dark:shadow-dark-subtle transition-all duration-200 ease-out">
            {/* Header */}
            <div className="space-y-1.5 text-left mb-8">
              <h2 className="text-[28px] font-semibold tracking-tight text-[#111827] dark:text-[#F8FAFC] leading-tight">
                Welcome Back
              </h2>
              <p className="text-body text-[#475569] dark:text-[#CBD5E1]">
                Sign in to continue managing your investments.
              </p>
            </div>

            {/* General Error Alert */}
            {error && (
              <div className="mb-6 p-3.5 rounded-btn bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium animate-fade-in">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-caption font-medium text-[#111827] dark:text-[#F8FAFC]"
                >
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-[#94A3B8] dark:text-[#64748B] pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={`w-full h-[44px] pl-10 pr-3.5 bg-slate-50 dark:bg-slate-900/60 border text-[#111827] dark:text-[#F8FAFC] placeholder-[#94A3B8] dark:placeholder-[#64748B] rounded-input text-body transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-50 ${
                      emailError
                        ? 'border-[#EF4444] focus:ring-[#EF4444]/30 focus:border-[#EF4444]'
                        : 'border-[#E5E7EB] dark:border-white/[0.08]'
                    }`}
                  />
                </div>
                {emailError && (
                  <p className="text-caption text-[#EF4444] mt-1">{emailError}</p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-caption font-medium text-[#111827] dark:text-[#F8FAFC]"
                  >
                    Password
                  </label>
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#94A3B8] dark:text-[#64748B] pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full h-[44px] pl-10 pr-10 bg-slate-50 dark:bg-slate-900/60 border text-[#111827] dark:text-[#F8FAFC] placeholder-[#94A3B8] dark:placeholder-[#64748B] rounded-input text-body transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-50 ${
                      passwordError
                        ? 'border-[#EF4444] focus:ring-[#EF4444]/30 focus:border-[#EF4444]'
                        : 'border-[#E5E7EB] dark:border-white/[0.08]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-[#94A3B8] dark:text-[#64748B] hover:text-[#111827] dark:hover:text-[#F8FAFC] transition-colors focus:outline-none"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-caption text-[#EF4444] mt-1">{passwordError}</p>
                )}
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none ${
                    rememberMe
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
                </button>
                <span
                  onClick={() => setRememberMe(!rememberMe)}
                  className="text-body text-[#475569] dark:text-[#CBD5E1] cursor-pointer select-none"
                >
                  Remember me for 30 days
                </span>
              </div>

              {/* Primary CTA Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[48px] rounded-btn bg-[#4F46E5] dark:bg-[#6366F1] hover:bg-[#4338CA] dark:hover:bg-[#4F46E5] text-white font-medium text-body transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/40 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-subtle"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            {/* Footer Sign Up Prompt & Legal */}
            <div className="mt-8 pt-6 border-t border-[#E5E7EB] dark:border-white/[0.06] text-center space-y-3">
              <p className="text-body text-[#475569] dark:text-[#CBD5E1]">
                Don't have an account?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center space-x-1"
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </p>

              <div className="flex items-center justify-center space-x-4 text-caption text-[#94A3B8] dark:text-[#64748B]">
                <a href="#" className="hover:underline">
                  Terms of Service
                </a>
                <span>•</span>
                <a href="#" className="hover:underline">
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Footer Copyright */}
        <div className="w-full max-w-[460px] text-center pt-6 text-caption text-[#94A3B8] dark:text-[#64748B]">
          © {new Date().getFullYear()} StockAI Platform. All rights reserved.
        </div>
      </div>
    </div>
  );
}
