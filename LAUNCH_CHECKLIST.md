# Production Launch Checklist & Operational Runbook
**Project:** AI Stock Analyzer (Indian Equities, NSE)  
**Architecture:** Next.js (Frontend) + FastAPI (Backend) + PostgreSQL + Redis  

---

## 1. Required Environment Variables & Secrets

### Backend (`backend/.env`)
| Variable | Required | Default / Format | Description |
|---|---|---|---|
| `SECRET_KEY` | **YES** | *None (Fails startup if missing)* | Minimum 32-character high-entropy secret for signing FastAPI JWTs. |
| `DATABASE_URL` | **YES** | `postgresql+asyncpg://user:pass@host:5432/db` | Production PostgreSQL connection string. |
| `REDIS_URL` | Optional | `redis://localhost:6379/0` | Cache for real-time quotes (10s TTL) & OHLCV history (24h TTL). In-memory fallback active if omitted. |
| `ALLOWED_ORIGINS` | **YES** | `https://your-frontend.vercel.app` | Comma-separated list of CORS origins. Explicit origins only; wildcard `*` rejected. |
| `TOKEN_ENCRYPTION_SECRET`| **YES** | 64-char hex / 32-byte key | Master key for AES-256-GCM encryption of Zerodha Kite access tokens. |
| `CRON_SECRET` | **YES** | High-entropy string | Authorization token required on signal resolution and cron trigger endpoints. |
| `DEMO_MODE` | **YES** | `false` | Must be `false` in production. Demo fixtures are hidden and fake data disabled. |
| `KITE_API_KEY` | Optional | Broker API Key | Zerodha Kite Connect API key for real-time tick streaming & live order execution. |
| `KITE_API_SECRET` | Optional | Broker Secret | Zerodha Kite Connect API secret. |
| `NVIDIA_API_KEY` | Optional | `nvapi-...` | Optional LLM synthesis via OpenAI-compatible endpoint. Falls back deterministically if omitted. |

### Frontend (`frontend/.env.production` / Vercel Environment Variables)
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **YES** | PostgreSQL pooled connection URL (Neon, Supabase, or AWS RDS). |
| `NEXTAUTH_SECRET` | **YES** | 32+ character secret for NextAuth session signing. |
| `NEXTAUTH_URL` | **YES** | Canonical frontend deployment URL (e.g. `https://stock-analyzer.vercel.app`). |
| `NEXT_PUBLIC_API_URL` | **YES** | Public or private backend API URL (e.g. `https://api.stock-analyzer.railway.app`). |
| `TOKEN_ENCRYPTION_SECRET`| **YES** | Same 32-byte key as backend for broker token AES-256-GCM encryption/decryption. |
| `CRON_SECRET` | **YES** | Shared secret header (`x-cron-secret`) for `/api/cron/resolve-signals` trigger. |
| `NEXT_PUBLIC_DEMO_MODE` | **YES** | Set strictly to `false` in production. |

---

## 2. Pre-Launch Verification Commands

Execute these commands before deploying any release to production:

### Backend Test Suite (Pytest)
```bash
cd backend
.\.venv\Scripts\pytest -v
```
*Expected: 28 of 28 tests passing (`test_auth_lockdown`, `test_backtest`, `test_market_data_service`, `test_no_random`, `test_risk_and_quant`).*

### Frontend Typecheck & Unit Tests
```bash
cd frontend
npx tsc --noEmit
npx tsx lib/signal-resolution.test.ts
npx tsx lib/auth-lockdown.test.ts
```
*Expected: Zero TypeScript compiler errors; all 8 signal resolution unit tests & 4 auth lockdown tests passing.*

### Production Build Verification
```bash
cd frontend
npm run build
```
*Expected: Clean production bundle compiled across all 29 routes without errors.*

---

## 3. Database Migration Runbook (PostgreSQL)

Prisma has been migrated from SQLite to PostgreSQL. To deploy schema to Neon, Supabase, or self-hosted PostgreSQL:

```bash
cd frontend
# 1. Apply all pending migrations to PostgreSQL
npx prisma migrate deploy

# 2. Re-generate Prisma Client
npx prisma generate
```

---

## 4. Deployment Instructions

### Backend (Railway / Render / Fly.io via Dockerfile)
The backend includes a production-ready `Dockerfile` and `railway.json`.
1. **Repository:** Connect the GitHub repository to Railway or Render.
2. **Root Directory:** Set Root Directory to `/backend`.
3. **Build Type:** Dockerfile (uses `backend/Dockerfile`).
4. **Environment Variables:** Set all variables from Section 1 (`SECRET_KEY`, `TOKEN_ENCRYPTION_SECRET`, `ALLOWED_ORIGINS`, `DATABASE_URL`, `DEMO_MODE=false`).
5. **Health Check:** `GET /health` returns `{"status": "ok"}`.

### Frontend (Vercel)
1. **Import Project:** Select the repository in Vercel.
2. **Root Directory:** Select `frontend`.
3. **Framework Preset:** Next.js.
4. **Build Command:** `prisma generate && next build` (configured in `package.json` and `vercel.json`).
5. **Environment Variables:** Set all variables from Section 1.

---

## 5. Ongoing Operational & Regulatory Risks

### 1. Daily Zerodha Kite Token Expiration (07:30 AM IST)
- **Risk:** Per Indian exchange & SEBI regulations, broker access tokens expire every morning at 07:30 AM IST.
- **Impact:** Live Kite price streaming and live order execution fail if the user has not re-authenticated via Kite Login.
- **Mitigation:** The application gracefully falls back to delayed yfinance quotes with an explicit data freshness badge (`DELAYED (15m)` / `LIVE`). Paper trading remains operational 24/7 without active broker connection.

### 2. Paper Trading Default vs Live Execution Opt-In
- **Rule:** Order placement defaults to `mode: 'PAPER'`.
- **Safeguard:** Submitting live orders to Kite requires explicit user opt-in (`live_trading_opt_in: true`) and checkbox confirmation in the order modal. Server verifies margin and live prices server-side; client prices are never trusted.

### 3. SEBI Regulatory Compliance & Disclaimers
- **Notice:** This platform is not a SEBI-registered Investment Adviser or Research Analyst.
- **Implementation:** Prominent "Not investment advice" disclaimers are rendered across all signal views, backtesting charts, and price cards. Dedicated `/terms` and `/privacy` pages document risk factors and data security policies.

### 4. Conservative Same-Bar Signal Resolution
- **Rule:** If a daily OHLCV bar touches both stop loss and target price on the same bar, the resolution engine marks it as `SL_HIT` to prevent performance exaggeration.
- **Timing:** Signals issued after 15:30 IST execute at the next trading day's official Open price.
- **Audit:** Performance metrics warn users if fewer than 30 closed signals exist to prevent sample-size deception.

