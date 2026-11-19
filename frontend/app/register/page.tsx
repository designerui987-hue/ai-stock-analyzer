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
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '@/store/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = () => {
    let valid = true;
    setUsernameError('');
    setEmailError('');
    setPasswordError('');
    setError('');

    if (!username.trim()) {
      setUsernameError('Full name is required.');
      valid = false;
    }

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
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
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
      const ok = await registerUser(email, username, password);
      if (ok) {
        router.push('/dashboard');
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. The email may already be in use.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#F5F7F7] text-[#142B32] antialiased">
      {/* Left Side (40% Desktop): Brand Section */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-12 relative overflow-hidden bg-[#142C33] text-[#c2ced0] border-r border-[#203c44]">
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
              Create your research workspace.
            </h1>
            <p className="text-sm text-[#b6c7ca] leading-relaxed">
              Track your personal watchlist, test ideas with paper limit orders, and explore rule-based equity analysis.
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-6 my-8">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-[8px] bg-[#203c44] text-[#a7d7bd] shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Deterministic Rule Observations
              </h3>
              <p className="text-xs text-[#899DA3] mt-0.5 leading-relaxed">
                Objective indicator signals evaluated with documented mathematical formulas.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-[8px] bg-[#203c44] text-[#a7d7bd] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Simulated Paper Trading
              </h3>
              <p className="text-xs text-[#899DA3] mt-0.5 leading-relaxed">
                Atomic order ledger, bracket exits, and cash management with zero real capital risk.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-6 border-t border-[#304951] text-xs text-[#899DA3]">
          <span>NSE Equities · Personal research workspace</span>
        </div>
      </div>

      {/* Right Side (60% Desktop): Registration Card */}
      <div className="flex-1 flex flex-col justify-between items-center p-6 sm:p-12 overflow-y-auto">
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
          <div className="w-full max-w-[460px] bg-white border border-[#E1E7E8] rounded-[20px] p-8 sm:p-10 shadow-sm transition-all duration-200 ease-out">
            <div className="space-y-1.5 text-left mb-6">
              <h2 className="text-[28px] font-semibold tracking-tight text-[#142B32] leading-tight">
                Create Account
              </h2>
              <p className="text-sm text-[#687A81]">
                Start your research workspace with StockAI today.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-[10px] bg-[#BB4B48]/10 border border-[#BB4B48]/20 text-[#BB4B48] text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#142B32] uppercase tracking-wider">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 w-4 h-4 text-[#899DA3] pointer-events-none" />
                  <input
                    type="text"
                    disabled={isLoading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Alex Morgan"
                    className={`w-full h-[44px] pl-10 pr-3.5 bg-[#F5F7F7] border text-[#142B32] placeholder-[#899DA3] rounded-[10px] text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/20 focus:border-[#087F73] ${
                      usernameError ? 'border-[#BB4B48]' : 'border-[#E1E7E8]'
                    }`}
                  />
                </div>
                {usernameError && <p className="text-xs text-[#BB4B48] mt-1">{usernameError}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#142B32] uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-[#899DA3] pointer-events-none" />
                  <input
                    type="email"
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={`w-full h-[44px] pl-10 pr-3.5 bg-[#F5F7F7] border text-[#142B32] placeholder-[#899DA3] rounded-[10px] text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/20 focus:border-[#087F73] ${
                      emailError ? 'border-[#BB4B48]' : 'border-[#E1E7E8]'
                    }`}
                  />
                </div>
                {emailError && <p className="text-xs text-[#BB4B48] mt-1">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#142B32] uppercase tracking-wider">
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#899DA3] pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={`w-full h-[44px] pl-10 pr-10 bg-[#F5F7F7] border text-[#142B32] placeholder-[#899DA3] rounded-[10px] text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/20 focus:border-[#087F73] ${
                      passwordError ? 'border-[#BB4B48]' : 'border-[#E1E7E8]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-[#899DA3] hover:text-[#142B32]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-[#BB4B48] mt-1">{passwordError}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[46px] rounded-[10px] bg-[#087F73] hover:bg-[#06685e] text-white font-medium text-sm transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#087F73]/40 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center space-x-2 mt-2 shadow-sm"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-[#E1E7E8] text-center">
              <p className="text-sm text-[#687A81]">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-[#087F73] hover:underline"
                >
                  Sign In →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
