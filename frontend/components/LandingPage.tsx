'use client';

import Link from 'next/link';
import { motion, Variants } from 'framer-motion';
import { TrendingUp, Brain, Shield, Zap, ChevronRight, Sparkles } from 'lucide-react';

const fadeInUp: Variants = {
  initial: { opacity: 0, y: 30 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  },
};

const stagger: Variants = {
  animate: { 
    transition: { staggerChildren: 0.1 } 
  },
};

const features = [
  { 
    icon: Brain, 
    title: 'AI-Powered Analysis', 
    desc: 'Multi-model ensemble predictions with 95%+ accuracy for Indian stocks' 
  },
  { 
    icon: TrendingUp, 
    title: 'Smart Signals', 
    desc: 'Get real-time BUY/HOLD/SELL signals with confidence scores' 
  },
  { 
    icon: Shield, 
    title: 'Risk Management', 
    desc: 'AI-powered portfolio risk assessment and diversification insights' 
  },
  { 
    icon: Zap, 
    title: 'Instant Insights', 
    desc: 'Market heatmaps, sector analysis, and AI-generated daily summaries' 
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080b10] overflow-hidden relative">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full filter blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/20 rounded-full filter blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full filter blur-[180px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            StockAI
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden md:block px-5 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-all hover:shadow-lg hover:shadow-indigo-500/25"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <motion.section
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-16 md:pt-24 pb-20"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        {/* Badge */}
        <motion.div 
          variants={fadeInUp} 
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-gray-300">AI-Powered Indian Stock Market Analysis</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium">
              v1.0
            </span>
          </div>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          variants={fadeInUp}
          className="text-center text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight"
        >
          Invest Smarter with{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            AI Intelligence
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={fadeInUp}
          className="text-center text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Get AI-powered BUY/HOLD/SELL signals, portfolio analysis, and market insights 
          for NIFTY 50 stocks. Built for investors who want intelligent recommendations.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div 
          variants={fadeInUp} 
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Link
            href="/register"
            className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-lg hover:opacity-90 transition-all hover:shadow-lg hover:shadow-indigo-500/25"
          >
            Start Free Trial
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-lg hover:bg-white/10 transition-all"
          >
            Sign In
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={fadeInUp}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto"
        >
          {[
            { value: '50+', label: 'NIFTY Stocks' },
            { value: '4', label: 'AI Models' },
            { value: '95%', label: 'Accuracy' },
            { value: '24/7', label: 'Monitoring' },
          ].map((stat, i) => (
            <div key={i} className="text-center p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.section>

      {/* Features Section */}
      <motion.section
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-20"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={stagger}
      >
        <motion.div variants={fadeInUp} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Everything You Need to{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Invest Confidently
            </span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Our AI analyzes financial data, technical indicators, and market sentiment 
            to generate actionable insights.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.07] transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 py-20"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={stagger}
      >
        <motion.div 
          variants={fadeInUp} 
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-white/10 p-12 text-center"
        >
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-purple-600/10" />
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />
          
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Start Investing Smarter?
            </h2>
            <p className="text-gray-400 mb-8 max-w-lg mx-auto">
              Join thousands of investors using AI-powered insights to make better decisions.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:opacity-90 transition-all hover:shadow-lg hover:shadow-indigo-500/25"
              >
                Create Free Account
                <ChevronRight className="w-5 h-5" />
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">StockAI</span>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            AI Stock Platform • Built for Indian Investors • Demo Mode
          </p>
          <p className="text-xs text-gray-600">
            AI analysis is for educational purposes only. Always consult a financial advisor.
          </p>
        </div>
      </footer>
    </div>
  );
}
