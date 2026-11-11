# AI Stock Analyzer — Master Project Documentation

**Project:** AI Stock Analyzer (Indian Equities — NSE)  
**Status:** MVP Ready / Production Hardened  
**Architecture:** Next.js 15 (Frontend) + FastAPI (Backend) + PostgreSQL (Database) + Redis (Cache)  
**Target Market:** National Stock Exchange of India (NSE)  

---

## 1. Project Overview & Mission

**AI Stock Analyzer** is a production-grade, audit-hardened financial analytics and quantitative intelligence platform built specifically for Indian equity markets (NSE). 

The core philosophy of the platform is **Absolute Data Integrity & Transparency**:
1. **NO Fake or Synthetic Data:** If market data is delayed or unavailable, the system renders an explicit `{ status: "unavailable", reason, as_of }` state rather than mocking prices or returns.
2. **NO Invented Machine Learning:** The platform strictly avoids deceptive labels such as "XGBoost", "Neural Net", or "LightGBM" unless an actual trained model produced the inference. All quantitative signals originate from transparent, deterministic rule sets (`rule_version: v1.0-deterministic-quant`).
3. **Deterministic & Conservative Accounting:** Stop-loss and target hit logic resolves against real daily OHLCV high/low bars. Same-bar conflicts conservatively default to `SL_HIT`. Walk-forward backtests include full Indian market friction (₹20 brokerage cap, 0.1% STT, 0.05% slippage, exchange fees, and 18% GST).
4. **Zero-Trust Security & Tenant Isolation:** User identity is extracted exclusively from cryptographically validated sessions/JWTs. Broker access tokens are encrypted with AES-256-GCM at rest.

---

## 2. Complete Chronology: What Was Done (Milestones Completed)

### Milestone 1: Elimination of Fake/Random Data & Mock ML
* **Audit & Grep Enforcement:**
  * Added automated grep-based regression tests (`test_no_random_in_production_python` and `test_no_math_random_in_production_ts`) ensuring zero occurrences of `random()`, `Math.random()`, or synthetic price generators in user-facing code paths.
* **Quant & Risk Computations:**
  * Replaced mock risk values in `backend/ai_models/sentiment_analyzer.py` with real historical mathematical calculations:
    * **Beta:** Computed from 1 year of daily returns against the benchmark index NIFTY 50 (`^NSEI`).
    * **Annualized Volatility:** Computed as $\sigma_{\text{daily}} \times \sqrt{252}$.
    * **Max Drawdown:** Peak-to-trough drop from daily price history.
    * **Sharpe Ratio:** Derived using India's risk-free rate (6.0% RBI repo rate).
* **Deterministic Sentiment & Regime Detection:**
  * Implemented deterministic sentiment hashing using word-frequency dictionaries rather than random scores.
  * Market regime detection uses SMA50 vs SMA200 and 20-day historical volatility.
* **Removal of Fake Model Breakdown:**
  * Purged all UI references to fake multi-model ensemble weights (XGBoost / LightGBM / Neural Net / Prophet). Replaced with transparent Quantitative Rule Catalysts with documented criteria.

---

### Milestone 2: Real Authentication & API Lockdown
* **Unified Cryptographic Authentication:**
  * Replaced insecure demo bypasses (`isLoggedIn: true`, mock tokens) with strict JWT verification across frontend route handlers and FastAPI backend endpoints.
  * Removed all `userId` parameters from request bodies and query parameters; user context is derived server-side from verified session headers.
* **Fail-at-Startup Secret Invariants:**
  * Both frontend and backend immediately fail boot sequences if critical production secrets (`SECRET_KEY`, `TOKEN_ENCRYPTION_SECRET`, `NEXTAUTH_SECRET`) are missing or match insecure default values.
* **CORS Origin Whitelisting:**
  * Replaced insecure `*` wildcard CORS with explicit domain matching parsed from `ALLOWED_ORIGINS`.
* **Administrative & Cron Security:**
  * Protected background cron routes (such as `/api/cron/resolve-signals`) with a mandatory `x-cron-secret` / `CRON_SECRET` header check.
* **Broker Security & Server-Side Execution:**
  * In `frontend/app/api/broker/orders/route.ts`, eliminated trusting client-sent prices. Live market prices are fetched directly on the server. Capital is verified against real Zerodha Kite funds.

---

### Milestone 3: Unified Data Layer & Real-Time Price Streaming
* **PostgreSQL Database Migration:**
  * Migrated Prisma ORM from local SQLite to PostgreSQL (compatible with Neon, Supabase, and AWS RDS) with structured migration scripts (`frontend/prisma/migrations/20261104100000_migrate_to_postgresql/migration.sql`).
* **Single Market Data Service (`backend/services/market_data_service.py`):**
  * Consolidated data retrieval into a unified provider architecture:
    * Primary real-time provider: Zerodha Kite WebSocket ticker (when user session is connected).
    * Fallback provider: `yfinance` for delayed quotes and historical daily OHLCV.
  * Dual-layer caching: Redis cache with in-memory fallback (10-second TTL for live quotes, 24-hour TTL for daily OHLCV bars).
* **Server-Sent Events (SSE) Streaming:**
  * Exposed `GET /api/stocks/stream?symbols=...` pushing real-time watchlist price updates every 3 seconds to connected dashboards.
* **Data Freshness Badging:**
  * Every price rendered on the platform carries a visual status badge:
    * `LIVE`: During active NSE hours (09:15–15:30 IST) with recent tick.
    * `DELAYED (15m)`: yfinance quote during market hours.
    * `STALE`: Out-of-hours timestamp.
    * `UNAVAILABLE`: Explicit error state when upstream feeds fail.
* **Consolidation of Duplicate Routes:**
  * Removed redundant Next.js Yahoo Finance routes; frontend calls the unified FastAPI backend.

---

### Milestone 4: Deterministic Signal Generation & Real Bar Resolution
* **Rule-Based Signal Engine (`frontend/lib/deterministic-signals.ts`):**
  * Production version: `v1.0-deterministic-quant`.
  * Signals generated strictly from verifiable technical conditions:
    * Trend alignment (Price above 20-day and 50-day SMA).
    * RSI momentum filters (35–65 pullback confirmation).
    * Volume surge verification (Volume > 1.2x 20-day average).
    * Dynamic stop-loss and target placement using Average True Range (ATR14) (Stop: 1.5x ATR, Target: 3.0x ATR for ~1:2 Risk/Reward).
* **Transparent Confidence Scoring (`docs/CONFIDENCE.md`):**
  * Explicit point-based scoring formula derived from rule agreement and data completeness (documented publicly; never misrepresented as win probability).
* **Daily Bar Resolution Engine (`frontend/lib/signal-resolution.ts`):**
  * Signals resolve against real historical daily High/Low bars.
  * **Same-Bar Conflict:** If both Target and Stop Loss fall within the daily High-Low span, it resolves conservatively to `SL_HIT`.
  * **After-Hours Entry:** Signals generated after market close (15:30 IST) execute at the next trading day's official Open price.
  * **SELL-side logic:** Properly evaluates inverted target and stop boundaries.
* **Performance Ledger Page (`/performance`):**
  * Renders cumulative win rate, average return %, max drawdown %, and trade counts with an alert banner warning users whenever the closed trade sample size is below 30 signals.

---

### Milestone 5: Quantitative Backtesting Engine, Paper Trading & Launch Prep
* **Walk-Forward Backtesting Engine (`backend/services/backtest_service.py` & `/backtest`):**
  * Evaluates strategies across 3+ years of NSE daily historical data against the NIFTY 50 index benchmark.
  * Simulates realistic Indian market friction: ₹20 brokerage cap, 0.1% STT delivery turnover, 0.05% slippage, exchange fees, and 18% GST.
  * Generates 3 chronological walk-forward validation splits (1 In-Sample calibration + 2 Out-of-Sample test windows) with zero lookahead bias.
  * Reports CAGR, Max Drawdown %, Sharpe Ratio, Win Rate %, Profit Factor, Trade Count, and Equity Curves.
* **Paper-Trading Default & Live Order Opt-In:**
  * Order placement defaults to `mode: 'PAPER'` (zero financial risk, logged to audit blotter).
  * Live orders to Zerodha Kite require an explicit user opt-in (`live_trading_opt_in: true`) and checkbox confirmation in the order placement modal.
* **Legal Disclaimers & Regulatory Pages:**
  * Built `/terms` and `/privacy` with comprehensive SEBI regulatory disclaimers (not a registered advisory, user assumes financial risk).
* **CI/CD & Deployment Configurations:**
  * GitHub Actions workflow (`.github/workflows/ci.yml`) automating linting, type-checking, backend Pytest, frontend unit tests, and production Next.js build.
  * Dockerfile and deployment configurations for Railway/Render (`backend/railway.json`) and Vercel (`frontend/vercel.json`).
  * Operational checklist documented in `LAUNCH_CHECKLIST.md`.

---

## 3. System Architecture & Tech Stack

```
                              ┌────────────────────────────────────────┐
                              │            Web Browsers                │
                              └──────────────────┬─────────────────────┘
                                                 │
                                                 │ HTTPS / WSS
                                                 ▼
┌────────────────────────────────────────────────┬────────────────────────────────────────────────┐
│ Next.js 15 Frontend (App Router, React 18, TS) │ FastAPI Backend (Python 3.12, Uvicorn, Async)  │
│                                                │                                                │
│ • Interactive Trading UI & Charts (Recharts)   │ • Unified MarketDataService (yfinance + Kite)  │
│ • Deterministic Signal Generation & Resolution │ • Quantitative BacktestEngine (Walk-Forward)   │
│ • Session Auth & Route Guards (NextAuth)       │ • Quantitative Risk Analyzer (Beta, Sharpe)    │
│ • Order Blotter & Paper Trading Default        │ • SSE Price Streamer (/api/stocks/stream)      │
│ • Prisma Client (PostgreSQL ORM)               │ • SQLAlchemy Async Engine                      │
└───────────────────────┬────────────────────────┴───────────────────────┬────────────────────────┘
                        │                                                │
                        ▼                                                ▼
     ┌──────────────────────────────────────┐         ┌──────────────────────────────────────┐
     │       PostgreSQL Database            │         │             Redis Cache              │
     │  (Users, Signals, Orders, Watchlist) │         │  (Quotes: 10s TTL, OHLCV: 24h TTL)   │
     └──────────────────────────────────────┘         └──────────────────────────────────────┘
```

### Detailed Component Specifications

| Layer | Component | Description |
|---|---|---|
| **Frontend Framework** | Next.js 15.5 | React 18 with App Router, Server Components, and API Routes. |
| **Styling & UI** | Tailwind CSS + Framer Motion | Modern, dark-mode optimized financial UI with responsive layout. |
| **Charting** | Recharts & Lightweight Charts | High-performance candlestick and equity curve rendering. |
| **Database ORM** | Prisma ORM 5.22 | PostgreSQL driver managing `User`, `Portfolio`, `Signal`, `OrderLog`, `BrokerConnection`. |
| **Backend Framework**| FastAPI 0.141+ | Async Python REST & Server-Sent Events API running on Uvicorn. |
| **Market Data** | yfinance + KiteConnect | Delayed historical data via Yahoo Finance; real-time streaming via Zerodha Kite ticker. |
| **Caching Layer** | Redis 5.0+ | In-memory key-value caching with fallback memory dictionary. |
| **Quant / Math** | NumPy, Pandas | Vectorized calculations for technical indicators, ATR, and walk-forward backtesting. |
| **Security** | PyCryptodome / Node Crypto | AES-256-GCM token encryption and JWT session verification. |

---

## 4. Key Application Pages & API Reference

### User-Facing Pages

1. **Dashboard (`/dashboard`):** Real-time watchlist, market overview, live price tickers with data freshness badges, and latest quant signals.
2. **Stock Analysis (`/stocks/[symbol]`):** Deep-dive analysis for any NSE ticker, interactive technical chart, calculated Beta/Sharpe metrics, ATR position sizer, and Paper/Live order placement modal.
3. **Quantitative Backtesting (`/backtest`):** Historical simulation engine evaluating strategy CAGR, Drawdown, Sharpe, and walk-forward cross-validation splits against the NIFTY 50 benchmark.
4. **Performance Ledger (`/performance`):** Transparent audit blotter of closed and open signals, showing real realized returns, exit reasons, and minimum-sample warnings.
5. **Order Blotter (`/orders`):** Comprehensive record of paper and live broker orders, fill prices, and execution statuses.
6. **Portfolio & Risk (`/portfolio`, `/portfolio/risk`):** Holdings management, sector exposure breakdown, and risk metrics.
7. **Market Heatmap (`/heatmap`):** Visual sector performance map across NSE equities.
8. **Legal & Compliance (`/terms`, `/privacy`):** SEBI disclaimers, algorithmic risk warnings, and zero-trust credential encryption policies.

### Core API Endpoints

#### Backend (FastAPI — Port 8000)
* `GET /api/stocks/quote/{symbol}`: Returns live/delayed quote with data freshness badge and timestamp.
* `GET /api/stocks/stream?symbols=...`: Server-Sent Events (SSE) streaming live quotes every 3 seconds.
* `GET /api/stocks/backtest?symbol=...&years=...&initial_capital=...`: Runs walk-forward backtest simulation with Indian market friction.
* `GET /api/stocks/{symbol}`: Comprehensive quantitative analysis, indicators, and risk metrics.
* `GET /health`: Health check endpoint.

#### Frontend Route Handlers (Next.js — Port 3000)
* `POST /api/broker/orders`: Validates session, verifies server-side market price, checks margins, and routes order to Paper Simulation or Zerodha Kite.
* `GET /api/signals/ledger`: Returns resolved signal ledger with win rate, profit factor, and average returns.
* `POST /api/cron/resolve-signals`: Background resolution cron protected by `CRON_SECRET` header.
* `POST /api/signals/generate`: Generates deterministic signals for target symbols using rule version `v1.0-deterministic-quant`.

---

## 5. Testing & Verification Suite

The repository is protected by comprehensive unit and integration tests across both stacks:

### Backend Pytest Suite (28 Passed)
Run via:
```bash
cd backend
.\.venv\Scripts\pytest -v
```
* `tests/test_no_random.py`: AST and regex scanning ensuring NO `random()` calls exist in production paths.
* `tests/test_auth_lockdown.py`: Tests secret key startup failures, unauthenticated 401s, and tenant isolation.
* `tests/test_backtest.py`: Verifies Indian friction math (brokerage, STT, slippage), synthetic backtest runs, and API endpoints.
* `tests/test_market_data_service.py`: Tests quote caching TTL, market hours logic (09:15–15:30 IST), freshness states, and provider fallbacks.
* `tests/test_risk_and_quant.py`: Validates deterministic sentiment, real beta/volatility calculations, and error-handling sentinels.
* `tests/test_basic.py`: Verifies JWT issuance, user registration, and portfolio persistence.

### Frontend Test Suite (Passed)
Run via:
```bash
cd frontend
npx tsx lib/signal-resolution.test.ts
npx tsx lib/auth-lockdown.test.ts
npx tsc --noEmit
npm run build
```
* **Signal Resolution Tests:** Verified same-bar `SL_HIT` conflict handling for BUY and SELL, next-day open entries after 15:30 IST, and minimum sample warning logic.
* **Auth Lockdown Tests:** Verified missing secret failures, cross-tenant isolation, and `CRON_SECRET` protection.
* **Typecheck & Build:** Clean compilation of all 29 routes with zero TypeScript errors.

---

## 6. How to Run the Application Locally

### Step 1: Start Backend (FastAPI)
```bash
cd backend
# Activate Python virtual environment
.\.venv\Scripts\activate
# Start Uvicorn server on port 8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 2: Start Frontend (Next.js)
```bash
cd frontend
# Start Next.js development server on port 3000
npm run dev
```

### Step 3: Access Platform
* Web Interface: [http://localhost:3000](http://localhost:3000)
* Interactive API Documentation (FastAPI Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

