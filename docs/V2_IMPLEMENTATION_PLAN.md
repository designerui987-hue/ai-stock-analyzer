# V2 Architecture & Implementation Plan
## AI-Powered Indian Equity Research & Portfolio Intelligence Platform

---

### Executive Overview & Strategic Vision
This document outlines the architectural upgrade of the **AI Stock Analyzer** into an enterprise-grade **Indian Equity Research & Portfolio Intelligence Platform**. The upgrade preserves 100% of existing, verified, working functionality across the Next.js 15.5 frontend, FastAPI backend, SQLite/Prisma databases, and Zerodha Kite Connect broker integration, while extending the system with institutional quantitative capabilities:
1. **Fundamental Analysis Engine** (real metrics, ratios, trends, and data dates).
2. **Transparent AI Evidence Engine** (technical, fundamental, market, and ensemble breakdown).
3. **Statistical Confidence Methodology** (transparent scoring, not arbitrary probabilities).
4. **Out-of-Sample Model Validation** (walk-forward validation, metrics like Sharpe, Sortino, Win Rate).
5. **Backtesting Lab (`/backtest`)** (comparing strategies against NIFTY 50 benchmark).
6. **Market Regime Engine** (real index trends, volatility, breadth, and sector rotation).
7. **"What Changed?" Engine** (state delta tracking for AI views and metrics).
8. **Paper Trading Mode** (virtual capital execution distinct from live Zerodha execution).
9. **Data Quality & Hygiene Layer** (Live vs Stale vs Delayed vs Unavailable validation).

---

## 1. Existing System Architecture (As-Is Audit)

### 1.1 Frontend Architecture
* **Framework:** Next.js 15.5 App Router with TypeScript (strict mode) and Tailwind CSS.
* **State Management:** Zustand (`useAuth` store, local React component state).
* **Charts:** Lightweight-Charts v4 (candlestick OHLCV) and Recharts (area spline, donut charts, sparklines).
* **Icons & Animation:** Lucide-React, Framer Motion.
* **Routes (26 Compiled Routes):**
  - Pages: `/`, `/login`, `/register`, `/dashboard`, `/portfolio`, `/portfolio/risk`, `/stocks/[symbol]`, `/stocks/[symbol]/options`, `/watchlist`, `/heatmap`, `/insights`, `/performance`, `/orders`, `/settings`, `/assistant`.
  - API Routes: `/api/stocks/[symbol]/chart`, `/api/stocks/[symbol]/quote`, `/live/stocks/[symbol]/chart`, `/live/stocks/[symbol]/quote`, `/api/signals/ledger`, `/api/signals/generate`, `/api/cron/resolve-signals`, `/api/broker/connection`, `/api/broker/orders`, `/api/broker/kite/login`, `/api/broker/kite/callback`, `/api/alerts/preferences`, `/api/alerts/subscribe-push`, `/api/telegram/webhook`.

### 1.2 Backend Architecture
* **Framework:** FastAPI 0.110 running under Uvicorn with StatReload on port 8000.
* **Data Sources:** Real-time ingestion from Yahoo Finance (`yfinance` in Python and `yahoo-finance2` in Next.js) using `.NS` ticker mappings.
* **Quant Engine:** `backend/ai_models/prediction_engine.py` calculates 12+ technical indicators mathematically (RSI, SMAs, EMAs, MACD, Bollinger Bands, ATR, ADX, Volume Surge).
* **AI Providers:** NVIDIA Nemotron-3 Super 120B client (`backend/ai_models/nvidia_client.py`) with deterministic mathematical fallback.
* **ORM & Database:** SQLite via SQLAlchemy (`backend/db/database.py`) and Prisma 5.22 (`frontend/prisma/dev.db`).

### 1.3 Database Schema (Current)
* **SQLAlchemy (`ai_stock.db`):** `users`, `portfolios`, `holdings`, `alerts`, `watchlist_items`.
* **Prisma (`dev.db`):** `Signal`, `AlertPreference`, `AlertLog`, `BrokerConnection`, `OrderLog`.

### 1.4 Broker & Notification Pipelines
* **Broker:** Zerodha Kite Connect v3 client (`frontend/lib/brokers/kite.ts`) with salted AES-256 GCM encrypted access token persistence.
* **Alerts:** Multi-channel dispatcher (`frontend/lib/alerts/dispatch.ts`) supporting Web Push (VAPID) and Telegram Bot API.

---

## 2. Core V2 Enhancements & Functional Additions

### Phase 1: Fundamental Analysis Engine
* **Goal:** Extract real fundamental financial metrics directly from exchange filings / Yahoo Finance summary financials without fake data.
* **Metrics:**
  - Health: Revenue growth, EBITDA growth, PAT growth, ROE, ROCE, Debt/Equity, Operating Cash Flow.
  - Valuation: P/E, P/B, EV/EBITDA, Historical Valuation Percentile, Sector-Relative P/E.
  - Growth: 3Y Revenue CAGR, Profit CAGR, Margin trend.
* **Strict Rule:** If a metric is missing, show `"Data unavailable"`. Never invent or randomize values.

### Phase 2: AI Evidence & Explainability Engine
* **Goal:** Upgrade binary "BUY/SELL" views into multi-dimensional "AI Investment Views" (POSITIVE / NEUTRAL / NEGATIVE) accompanied by transparent evidence.
* **Evidence Dimensions:**
  - Technical Evidence (RSI, MACD, SMAs, Momentum, Relative Strength).
  - Fundamental Evidence (Earnings growth, ROCE, Debt, Valuation).
  - Market Evidence (Sector momentum, Market regime, NIFTY breadth).
  - Model Evidence (XGBoost, LightGBM, Neural Net model votes).
  - Risk Factors (Valuation risk, Volatility risk, Liquidity risk).

### Phase 3: Statistical Confidence Methodology
* **Goal:** Demystify the "Confidence Score" into a transparent 0-100 composite index rather than an arbitrary win probability.
* **Formula:**
  $$\text{Confidence Score} = w_1 \cdot \text{Model Agreement} + w_2 \cdot \text{Signal Strength} + w_3 \cdot \text{Data Completeness} + w_4 \cdot \text{Regime Compatibility}$$
* **Documentation:** Stored in `/docs/AI_CONFIDENCE_METHODOLOGY.md` with an accessible in-app tooltip.

### Phase 4: Model Validation Engine
* **Goal:** Track historical out-of-sample directional accuracy, precision, recall, and win-rate across models (XGBoost, LightGBM, Neural Net, Ensemble).
* **Validation Methodology:** Walk-forward rolling windows on historical NSE data avoiding look-ahead bias and data leakage.

### Phase 5: Backtesting Lab (`/backtest`)
* **Goal:** Dedicated backtesting laboratory comparing user parameters (Capital, Strategy, Stop Loss, Target, Slippage) directly against NIFTY 50 Buy & Hold benchmark.
* **Metrics:** CAGR, Max Drawdown, Sharpe Ratio, Sortino Ratio, Win Rate, Profit Factor, Trade Count.

### Phase 6: Market Regime & Sector Intelligence
* **Goal:** Replace randomized regime detection with real mathematical regime classification using NIFTY 50 50/200 DMA trend, 20-day ATR volatility, and advance/decline breadth.
* **Regimes:** `BULLISH_TREND`, `BEARISH_TREND`, `HIGH_VOLATILITY`, `RANGE_BOUND / SIDEWAYS`.

### Phase 7: "What Changed?" Engine
* **Goal:** Compare daily snapshots to detect and highlight deltas (e.g. RSI crossed 60, ROCE improved, AI confidence shifted +8 pts).

### Phase 8: Paper Trading Mode
* **Goal:** Virtual ₹10,00,000 portfolio sandbox with real-time order fills, position sizing limits, and P&L tracking, clearly segregated from live Zerodha execution.

---

## 3. Implementation Guardrails & Files Protected

### 3.1 Files That Must NOT Be Broken or Unnecessarily Replaced
* `frontend/components/layout/Header.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `ClientLayout.tsx`
* `frontend/lib/brokers/kite.ts`, `interface.ts`, `rateLimiter.ts`, `crypto.ts`
* `frontend/lib/alerts/dispatch.ts`, `webPush.ts`, `telegram.ts`
* `frontend/lib/positionSizing.ts`, `optionChain.ts`, `signal-resolution.ts`
* `backend/ai_models/nvidia_client.py`
* Existing route handlers in `frontend/app/api/...`

### 3.2 New Files to Create
1. `/docs/V2_IMPLEMENTATION_PLAN.md` (This document)
2. `/docs/AI_CONFIDENCE_METHODOLOGY.md`
3. `backend/services/fundamental_service.py` (Real fundamental metrics calculation & ingestion)
4. `backend/services/market_regime_service.py` (Real NIFTY trend & breadth quant detector)
5. `backend/services/backtest_engine.py` (Quant backtest simulator vs NIFTY 50)
6. `backend/api/fundamentals.py` (`/api/stocks/{symbol}/fundamentals`)
7. `backend/api/backtest.py` (`/api/backtest`)
8. `frontend/app/backtest/page.tsx` (Backtesting Lab UI)
9. `frontend/lib/fundamentals.ts` (Frontend fundamental types and adapters)
10. `frontend/lib/paperTrading.ts` (Virtual capital store & order simulator)

---

## 4. Phased Execution Roadmap

* **Phase 0:** Complete Repository Audit & Implementation Plan (`/docs/V2_IMPLEMENTATION_PLAN.md`).
* **Phase 1:** Fundamental Analysis Engine (Backend service + API + Frontend component with real data).
* **Phase 2:** AI Evidence Engine (Upgrade AI view, technical/fundamental/market factors, transparent reasoning).
* **Phase 3:** Confidence Methodology (`/docs/AI_CONFIDENCE_METHODOLOGY.md` + UI Tooltip).
* **Phase 4:** Model Validation Engine (Out-of-sample performance metrics).
* **Phase 5:** Backtesting Lab (`/backtest` route with NIFTY benchmark comparison).
* **Phase 6:** Market Regime Engine (Quant-based NIFTY trend & breadth classifier).
* **Phase 7:** Sector Intelligence & "What Changed?" Engine.
* **Phase 8:** Paper Trading Mode.
* **Verification:** Run `npm run build`, Python tests, and check all routes for 0 regressions.
