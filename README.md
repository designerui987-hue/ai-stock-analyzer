# 🚀 AI Stock Analyzer (Indian Equities — NSE)

A production-hardened, audit-compliant financial analytics and quantitative intelligence platform built specifically for Indian equities on the National Stock Exchange (NSE).

Built with **Next.js 15 (App Router, React 18, TypeScript)**, **FastAPI (Python 3.12, Async)**, **PostgreSQL (Prisma ORM)**, and **Redis**.

---

## 📖 Key Documentation

* 📘 **[Master Project Documentation](docs/PROJECT_DOCUMENTATION.md)** — Complete technical architecture, chronology of work completed, API reference, and testing guide.
* 🎯 **[Signal Confidence Formula](docs/CONFIDENCE.md)** — Mathematical breakdown of transparent, deterministic rule agreement scoring.
* 🚀 **[Launch Checklist & Runbook](LAUNCH_CHECKLIST.md)** — Environment variables, secrets, deployment runbooks (Vercel & Railway/Render), and operational risks.
* 📜 **[Terms & Regulatory Disclaimers](frontend/app/terms/page.tsx)** — SEBI disclosures and algorithmic risk warnings.

---

## ✨ Core Highlights & Architectural Principles

1. **Zero Synthetic / Random Data:** No `Math.random()`, placeholder prices, or mock returns in user paths. Missing data returns an explicit `{ status: "unavailable", reason, as_of }` state.
2. **Deterministic Quant Rules (No Fake ML):** Pure, verifiable rules (`v1.0-deterministic-quant`) based on Trend (SMA 20/50), RSI momentum, Volume surge, and ATR-based stops.
3. **Realistic Indian Market Backtester (`/backtest`):** Historical walk-forward simulation vs NIFTY 50 Buy & Hold, accounting for Indian brokerage (₹20 cap), 0.1% STT delivery turnover, 0.05% slippage, exchange fees, and 18% GST. Zero lookahead bias.
4. **Conservative Same-Bar Resolution:** Daily bars touching both Stop Loss and Target resolve conservatively to `SL_HIT`. Signals issued after market close (15:30 IST) enter at next-day Open.
5. **Paper Trading Default:** Orders default to simulation mode with zero financial risk. Live Kite orders require explicit per-user opt-in and confirmation modals.
6. **Real-Time Data Streaming:** Server-Sent Events (SSE) push live prices for user watchlists with freshness badges (`LIVE`, `DELAYED (15m)`, `STALE`, `UNAVAILABLE`).
7. **Zero-Trust Security:** User identity derived strictly from cryptographically verified sessions/JWTs. Broker access tokens are encrypted with AES-256-GCM.

---

## 🛠️ Quick Start

### Prerequisites
* Node.js 20+
* Python 3.12+
* PostgreSQL for the application workflows. Redis is optional for local development.

Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` to your PostgreSQL database and provide local values for `SECRET_KEY`, `TOKEN_ENCRYPTION_SECRET`, and `CRON_SECRET`. Create `frontend/.env` with the same four values, `NEXT_PUBLIC_API_URL=http://localhost:8000`, and `ENABLE_LIVE_TRADING=false`.

For automatic paper limit fills, configure the Kite keys in both apps and connect Zerodha in Settings. The backend uses `ZERODHA_API_KEY` and `ZERODHA_API_SECRET`, while the frontend uses `KITE_API_KEY` and `KITE_API_SECRET`. Set `KITE_WS_ENABLED=true` and `PAPER_ORDER_EVALUATION_URL=http://localhost:3000/api/broker/orders/evaluate` in `backend/.env`. Resting orders require a valid Kite session to receive new trades.

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup
```bash
cd frontend
npm ci
npx prisma generate
npm run db:setup
npm run dev
```
Web Interface: [http://localhost:3000](http://localhost:3000)

---

## 🧪 Running the Test Suites

### Backend Unit Tests
```bash
cd backend
.\.venv\Scripts\pytest -v
```

### Frontend Typecheck & Tests
```bash
cd frontend
npx tsc --noEmit
npm test
npm run build
```

---

## ⚖️ Regulatory Disclaimer
AI Stock Analyzer is an educational and analytical research software platform. It is **not** a SEBI-registered Investment Adviser (IA) or Research Analyst (RA). Simulated backtest performance and algorithmic signals do not guarantee future returns.
