# Production Launch Checklist & Operational Runbook
**Project:** AI Stock Analyzer (Indian Equities, NSE)  
**Architecture:** Next.js (Frontend on Vercel) + FastAPI (Backend on Railway) + PostgreSQL + Redis  

---

## 1. Required Environment Variables & Secrets

Templates are provided in `backend/.env.example` and `frontend/.env.example`.

### Backend (`backend/.env` / Railway Service Variables)
| Variable | Required | Default / Format | Description |
|---|---|---|---|
| `APP_ENV` | **YES** | `production` | Explicit runtime mode (`development` \| `staging` \| `production`). Dev-only providers (e.g. GNews free tier) remain disabled unless strictly `development`. |
| `SECRET_KEY` | **YES** | *None (Fails startup if missing)* | High-entropy 32+ char secret for FastAPI JWT signing. |
| `TOKEN_ENCRYPTION_SECRET` | **YES** | *None (Fails startup if missing)* | Master secret for AES-256-GCM encryption/decryption of Zerodha Kite access tokens (must match frontend). |
| `CRON_SECRET` | **YES** | *None* | Shared header (`x-cron-secret`) protecting cron/admin routes. |
| `DATABASE_URL` | **YES** | `postgresql+asyncpg://...` | PostgreSQL connection URL. |
| `REDIS_URL` | **YES (Prod)** | `redis://...` | Shared Redis store for atomic research API quotas, cross-worker coalescing locks, scoped quote caches, and `ws:tick:...` hot WebSocket ticks. |
| `ALLOWED_ORIGINS` | **YES** | `https://your-app.vercel.app` | Comma-separated explicit CORS origins (`*` rejected). |
| `DEMO_MODE` | **YES** | `false` | Must be `false` in production; static fixtures never shown in normal flows. |
| `KITE_WS_ENABLED` | **Recommended** | `true` (when live Kite connected) | Enables persistent authenticated Kite WebSocket binary tick collector. |
| `FEED_QUOTE_MAX_AGE_SECONDS` | Optional | `60` | Maximum allowed age of exchange quote timestamps (`as_of`) for freshness & order validation. |
| `RESEARCH_RATE_LIMIT_PER_MINUTE` | Optional | `30` | Per-user caller rate limit on `/api/data-sources/*`. |
| `ZERODHA_API_KEY` / `ZERODHA_API_SECRET` | Optional | Broker credentials | Server-side Kite Connect API key/secret. Never exposed in frontend bundles or query params. |

### Frontend (`frontend/.env.production` / Vercel Environment Variables)
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **YES** | PostgreSQL connection URL for Prisma. |
| `SECRET_KEY` | **YES** | Must match backend JWT verification secret for Next.js API routes. |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | **YES** | Canonical deployment secret and URL (`https://...vercel.app`). |
| `NEXT_PUBLIC_API_URL` | **YES** | Public HTTPS FastAPI URL (e.g. `https://api.your-domain.com`). Production client throws explicit configuration error rather than falling back to `localhost`. |
| `BACKEND_API_URL` | **YES** | Server-side backend URL used by Next.js API routes & cron handlers (`/api/broker/orders`, `/api/signals/generate`, `/api/cron/resolve-signals`). |
| `TOKEN_ENCRYPTION_SECRET` | **YES** | Same master key as backend for Kite access token encryption/decryption. |
| `CRON_SECRET` | **YES** | Secret header (`x-cron-secret`) for `/api/cron/resolve-signals`. |
| `NEXT_PUBLIC_DEMO_MODE` | **YES** | Set strictly to `false` in production. |
| `ENABLE_LIVE_TRADING` | **Safety Gate** | Keep `false` (default) until open-market Kite WebSocket & static IP order testing are complete. Returns HTTP 403 on `mode: LIVE` while `false`. |
| `KITE_SANDBOX` | **Safety Gate** | Must be `false` in production. |

---

## 2. Pre-Launch Verification Commands

### Backend Test Suite (Pytest)
```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```
*Verifies: auth lockdown, external provider quota/async/exchange hardening, NSE calendar, Kite WS binary parsing & dedup, scoped quote caching, indicator math, `no_random` enforcement.*

### Frontend Typecheck, Unit Tests & Production Build
```bash
cd frontend
npx prisma generate
npx tsc --noEmit
npx tsc --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outDir .tmp-tests lib/audit-regressions.test.ts lib/signal-resolution.test.ts
node .tmp-tests/audit-regressions.test.js
node .tmp-tests/signal-resolution.test.js
npm run build
```

---

## 3. Database Migration Runbook (PostgreSQL)

Includes order safety columns (`mode`, `exchange`, `idempotency_key`, `quote_as_of`, `slippage_bps`, `fees_inr`) and unique `(user_id, idempotency_key)` constraint on `"OrderLog"`.

```bash
cd frontend
npx prisma migrate deploy
npx prisma generate
```

---

## 4. Deployment Architecture & Runtime Verification

### Backend (Always-On Process on Railway / Render / Fly.io)
- Use an always-on container (do **NOT** deploy FastAPI WebSocket collectors on serverless functions).
- Run single WS collector worker or multiple workers backed by shared **Redis** (`ws:tick:{user_id}:{exchange}:{symbol}`) so hot ticks immediately bypass the 10s REST cache across workers.
- Health check endpoint: `GET /health` returns real subsystem telemetry (`live_feed.provider_status`, `live_feed.last_tick_at`, `websocket_enabled`, `demo_mode`, `app_env`), never hardcoded `"ok"` for disconnected feeds.
- **Zerodha Kite Live Order Static IP Requirement:** Per SEBI/exchange rules for algorithmic & third-party API order placement, register your Railway egress static IP with Zerodha Kite Connect before setting `ENABLE_LIVE_TRADING=true`.

### Frontend (Vercel)
- Root Directory: `frontend`.
- Ensure both `NEXT_PUBLIC_API_URL` and `BACKEND_API_URL` point to the live Railway FastAPI HTTPS origin.
- Verify `ALLOWED_ORIGINS` on Railway includes the exact Vercel preview/production domain(s).

### Rollback Procedure
1. Immediately set `ENABLE_LIVE_TRADING=false` in Vercel environment variables if any anomalous live order behavior appears (kills real-money order routing while leaving paper ledger & analytics online).
2. Reconcile any `UNKNOWN` / `OPEN` orders in `/orders` via **Reconcile** (`PATCH /api/broker/orders`) before re-enabling.
3. Roll back to the prior Vercel deployment or Railway image tag if API compatibility regressions occur.

---

## 5. Open Pre-Live Verification Items (Outside Offline Test Scope)
The following items require a live NSE trading session (09:15–15:30 IST) with funded Zerodha Kite credentials and cannot be verified offline:
1. Live end-to-end Kite WebSocket streaming tick latency (`kite_ws` -> SSE -> browser UI) during active NSE continuous trading hours.
2. Live `OrderLog` migration execution (`prisma migrate deploy`) against the target cloud PostgreSQL instance.
3. End-to-end live Kite order placement, static IP whitelist validation, and tag reconciliation (`ENABLE_LIVE_TRADING=true` explicitly gated off until verified).

---

## 6. Ongoing Regulatory & Operational Controls
- **Daily Kite Token Expiry (07:30 IST):** Expired tokens transition backend collectors cleanly to `TOKEN_EXPIRED` (avoiding blind reconnect loops) and fall back to labeled `DELAYED` (`yfinance`) or `UNAVAILABLE` states.
- **Paper vs Live Ledger Isolation:** Paper orders track slippage (`5 bps`), statutory Indian equity fees (STT, stamp duty, exchange txn, SEBI, GST), and closed-market queueing (`OPEN` vs `FILLED`) in a strictly segregated `PAPER` ledger.
- **Disclaimers:** Every signal and price surface displays `source`, observation `as_of`, and explicit `"Not investment advice"` notices.
