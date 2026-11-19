import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light & Dark system neutrals (Slate palette)
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          850: '#121826',
          900: '#0F172A',
          950: '#0B0F17',
        },
        // Accents
        indigo: {
          DEFAULT: '#6366F1',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        // StockAI Design Reference Tokens
        stockai: {
          nav: '#142C33',
          ink: '#142B32',
          canvas: '#F5F7F7',
          surface: '#FFFFFF',
          teal: '#087F73',
          'teal-soft': '#E3F2ED',
          'teal-hover': '#076f64',
          muted: '#687A81',
          line: '#E1E7E8',
          red: '#BB4B48',
          tag: '#EEF2F2',
          'brief-bg': '#EAF2EC',
          'brief-border': '#D8E5DE',
          'caution-bg': '#FAF3E5',
          'caution-border': '#EEE2C6',
          'caution-text': '#8B734D',
        },
        blue: {
          DEFAULT: '#3B82F6',
          500: '#3B82F6',
          600: '#2563EB',
        },
        emerald: {
          DEFAULT: '#10B981',
          500: '#10B981',
          600: '#059669',
        },
        amber: {
          DEFAULT: '#F59E0B',
          500: '#F59E0B',
          600: '#D97706',
        },
        red: {
          DEFAULT: '#EF4444',
          500: '#EF4444',
          600: '#DC2626',
        },
      },
      borderRadius: {
        'card': '16px',
        'card-lg': '20px',
        'btn': '12px',
        'input': '12px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02)',
        'elevation': '0 4px 16px -2px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'dark-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
        'dark-elevation': '0 8px 24px -4px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 180ms ease-out forwards',
        'scale-in': 'scaleIn 180ms ease-out forwards',
        'slide-up': 'slideUp 200ms ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
