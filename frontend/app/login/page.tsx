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
  const { setAuth } = useAuth();

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

    // Simulate authentication process with 900ms delay
    setTimeout(() => {
      setIsLoading(false);
      setAuth('demo-access-token-12345', {
        id: 'usr-1',
        email: email,
        username: email.split('@')[0],
      });
      router.push('/dashboard');
    }, 900);
  };

  const handleSocialLogin = (provider: string) => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setAuth(`demo-${provider.toLowerCase()}-token`, {
        id: 'usr-social',
        email: `investor@${provider.toLowerCase()}.com`,
        username: `${provider.toLowerCase()}User`,
      });
      router.push('/dashboard');
    }, 800);
  };

  return (
    <div className="min-h-screen w-full flex bg-[#F8FAFC] dark:bg-[#0B0F17] text-[#111827] dark:text-[#F8FAFC] antialiased selection:bg-indigo-500/20">
      {/* ── Left Side (40% Desktop): Brand & Value Proposition ────── */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-12 relative overflow-hidden bg-slate-100/70 dark:bg-[#0E1523] border-r border-slate-200 dark:border-white/[0.08]">
        {/* Subtle Background Vector Graph (Low Opacity) */}
        <div className="absolute inset-0 pointer-events-none opacity-5 dark:opacity-10 flex items-center justify-center">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 600"
            fill="none"
            className="w-full h-full text-slate-900 dark:text-white stroke-current"
          >
            <path
              d="M0 450 Q 200 350, 400 420 T 800 200"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <path d="M0 500 Q 250 400, 500 300 T 800 150" strokeWidth="3" />
          </svg>
        </div>

        {/* Top: Logo & Name */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-btn bg-indigo-600 text-white flex items-center justify-center shadow-subtle">
              <TrendingUp className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              StockAI
            </span>
          </div>

          <div className="mt-12 space-y-3">
            <h1 className="text-display font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              Invest Smarter with AI-Powered Market Intelligence
            </h1>
            <p className="text-body text-slate-600 dark:text-[#CBD5E1]">
              Institutional-grade multi-model ensemble analytics, real-time NIFTY telemetry, and automated portfolio rebalancing.
            </p>
          </div>
        </div>

        {/* Middle: Concise Feature Highlights */}
        <div className="relative z-10 space-y-6 my-8">
          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-indigo-600 dark:text-indigo-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                AI Stock Analysis
              </h3>
              <p className="text-caption text-slate-500 dark:text-[#64748B] mt-0.5">
                Multi-model predictions (XGBoost, Neural Net, LightGBM) with confidence ratings.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-indigo-600 dark:text-indigo-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Real-Time Portfolio Tracking
              </h3>
              <p className="text-caption text-slate-500 dark:text-[#64748B] mt-0.5">
                Live asset allocation metrics, P&L tracking, and instant risk alerts.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-2.5 rounded-btn bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Smart Market Insights
              </h3>
              <p className="text-caption text-slate-500 dark:text-[#64748B] mt-0.5">
                Daily signal stream for earnings beats, technical breakouts, and macro trends.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom: Social Proof */}
        <div className="relative z-10 pt-6 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center space-x-2 text-caption text-slate-500 dark:text-[#64748B]">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Trusted by thousands of active retail & institutional investors.</span>
        </div>
      </div>

      {/* ── Right Side (60% Desktop): Centered Auth Card ────────────── */}
      <div className="flex-1 flex flex-col justify-between items-center p-6 sm:p-12 overflow-y-auto">
        {/* Mobile Header Logo */}
        <div className="lg:hidden w-full max-w-[460px] flex items-center space-x-3 mb-6">
          <div className="w-8 h-8 rounded-btn bg-indigo-600 text-white flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            StockAI
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
                  <Link
                    href="/login"
                    className="text-caption font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Forgot Password?
                  </Link>
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

            {/* Secondary Divider */}
            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB] dark:border-white/[0.08]" />
              </div>
              <span className="relative px-3 bg-white dark:bg-[#121826] text-caption font-medium uppercase tracking-wider text-[#94A3B8] dark:text-[#64748B]">
                OR
              </span>
            </div>

            {/* Social Login Buttons */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleSocialLogin('Google')}
                disabled={isLoading}
                className="w-full h-[44px] rounded-btn border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#111827] dark:text-[#F8FAFC] text-body font-medium transition-all duration-150 ease-out flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.24 21.3 7.37 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.99 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.24 2.7 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleSocialLogin('Apple')}
                disabled={isLoading}
                className="w-full h-[44px] rounded-btn border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#111827] dark:text-[#F8FAFC] text-body font-medium transition-all duration-150 ease-out flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.89.24-9.76-1.85-14.61-6.23-3.26-2.85-7.18-7.6-11.76-14.25-6.53-9.49-11.66-19.82-15.39-31.01-3.73-11.19-5.6-22.13-5.6-32.82 0-14.73 3.73-26.96 11.19-36.69 7.46-9.73 16.79-14.72 27.99-14.96 4.67 0 9.77 1.13 15.3 3.39 5.53 2.26 9.49 3.39 11.88 3.39 2.15 0 6.07-1.19 11.76-3.57 5.69-2.38 10.59-3.45 14.71-3.21 11.55.72 20.87 4.96 27.97 12.74-25.07 15.15-24.6 37.38.95 51.52.59.36 1.25.77 1.96 1.25-4.28 12.38-10.23 24.38-17.85 36.02zM119.22 31.08c0-7.38 2.65-14.4 7.95-21.07 5.3-6.67 11.96-10.45 19.98-11.35.36 2.02.54 3.99.54 5.91 0 7.37-2.67 14.33-8.01 20.88-5.34 6.55-12.1 10.37-20.28 11.45-.06-1.57-.18-3.51-.18-5.82z" />
                </svg>
                <span>Continue with Apple</span>
              </button>

              <button
                type="button"
                onClick={() => handleSocialLogin('Microsoft')}
                disabled={isLoading}
                className="w-full h-[44px] rounded-btn border border-[#E5E7EB] dark:border-white/[0.08] bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#111827] dark:text-[#F8FAFC] text-body font-medium transition-all duration-150 ease-out flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                <span>Continue with Microsoft</span>
              </button>
            </div>

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
