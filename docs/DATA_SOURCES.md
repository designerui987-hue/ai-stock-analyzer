# External Research Data Providers — Audit & Capability Matrix

**Verification Date:** 2026-11-11  
**Directory Reference:** `public-apis/public-apis` (discovery catalog only; individual provider terms govern every endpoint).  
**Workflow Boundary:** All providers below are **supplemental research / reference feeds**. None feed executable NSE trading quotes, signal generation, or order validation (`KiteMarketDataProvider` / `YFinanceProvider` remain isolated in `backend/services/market_data_service.py`).

---

## 1. Audited Provider Capability & Terms Matrix

| Provider | Free Plan & Auth | Supported Datasets & NSE Coverage | Update Frequency & Timestamp Semantics | Caching & Redistribution Terms | Implemented Freshness Label | Live Check Result (2026-11-11) |
|---|---|---|---|---|---|---|
| **Frankfurter** (`api.frankfurter.dev/v1`) | Free, **no key**, fair-use policy | ECB reference FX rates (USD, EUR, GBP, JPY, INR, etc.). **No equities / no NSE.** | Daily ECB fix (~16:00 CET working days). API returns `date` (effective date); never substitute retrieval time. | Historical fixes immutable (cache long); latest cached 1h. High volume should self-host Docker image. Upstream ECB terms apply. | `REFERENCE_RATE` (**not executable FX prices**) | **Succeeded** — `GET /v1/latest?base=USD&symbols=INR` returned HTTP 200 (`date: 2026-11-10`, `INR: 93.93`) |
| **World Bank Open Data** (`api.worldbank.org/v2`) | Free, **no key**, no hard rate cap | India macro series (GDP growth, CPI inflation, unemployment, CA balance, debt, GDP/capita). **No equities / no intraday.** | Annual / quarterly revised statistics (`date` = year string; `lastupdated` in metadata). | **CC BY 4.0** (attribution required; no endorsement claims; third-party series may differ). Local caching recommended (24h). | `END_OF_DAY` (labelled **Annual / Revised**) | **Succeeded** — `NY.GDP.MKTP.KD.ZG` for `IN` returned HTTP 200 (`date: 2025`, `value: 7.566...`, `lastupdated: 2026-10-08`) |
| **MFapi.in** (`api.mfapi.in`) | Free, **no key**, fair-use policy | Indian Mutual Fund scheme search & historical NAVs sourced from AMFI feeds. **Not NSE equities.** | Updates daily after AMFI NAV release. Date returned in `DD-MM-YYYY` (`observation_time`). | Fair use; local caching recommended (1h). Independent community wrapper, **not** official AMFI portal. | `NAV` (explicit NAV date required; optional tab) | **Succeeded** — `/mf/119551/latest` & `/mf/search?q=hdfc` returned HTTP 200 (`09-11-2026`, NAV `107.41350`) |
| **Alpha Vantage** (`alphavantage.co`) | Free key required (`ALPHA_VANTAGE_API_KEY`): **25 req/day, 5 req/min** | FX reference (`CURRENCY_EXCHANGE_RATE`) & limited `.BSE` daily EOD (`TIME_SERIES_DAILY`, unadjusted). **NO free live NSE quotes; NSE `.NS` unreliable.** `TIME_SERIES_DAILY_ADJUSTED` is **premium/paid only**. | Daily EOD (`YYYY-MM-DD`) or FX `6. Last Refreshed`. Quota/paywall notices arrive inside HTTP 200 JSON (`Note` / `Information`). | Personal / evaluation / non-commercial free use; no bulk redistribution. | `END_OF_DAY` / `REFERENCE_RATE` | **Disabled cleanly without key** (audited via official docs; tested via fixtures including HTTP 200 `Note`/`Information`) |
| **Twelve Data** (`api.twelvedata.com`) | Free Basic key (`TWELVEDATA_API_KEY`): **800 credits/day, 8 credits/min** (credit-weighted) | Free Basic plan covers US equities, FX, crypto for **internal evaluation only**. **India NSE requires paid Grow/Pro/Ultra tier.** | Intraday/EOD with `datetime` string. Errors/429 can return inside HTTP 200 JSON (`status: "error"`). | **Terms §2.3**: Free Basic plan strictly prohibits production/commercial deployment or external streaming. Paid tiers require attribution unless waived. | `END_OF_DAY` (when paid `TWELVEDATA_PLAN` enabled; blocked in prod on `free`) | **Disabled cleanly without key & gated on free plan** (tested via fixtures for 429/200 errors & NSE plan block) |
| **GNews** (`gnews.io/api/v4`) | Free key (`GNEWS_API_KEY`, **dev-only**): **100 req/day**, resets 00:00 UTC, max 10 articles/req | Indian financial headlines (`country=in`, `lang=en`), last 30 days, content truncated to 250 chars. **Not permitted in production.** | **12-hour delay** on free tier; `publishedAt` per article. Exceeding cap returns HTTP 403/429. | Free tier strictly prohibits commercial projects and production deployment (`localhost`/eval only). | `DELAYED` (development-only; never entry triggers) | **Disabled in production & without dev flag** (tested via fixtures & secret-leakage tests) |

---

## 2. Features Intentionally Disabled or Excluded

- **Live NSE Quotes via Alpha Vantage / Twelve Data Free Tiers:** Both providers prohibit or lack reliable free live NSE streaming. Disabled by default; live NSE trading relies exclusively on verified **Zerodha Kite** credentials.
- **`TIME_SERIES_DAILY_ADJUSTED` on Alpha Vantage (`ALPHA_VANTAGE_PLAN=free`):** Premium endpoint on Alpha Vantage — blocked locally before burning daily quota.
- **Twelve Data Free Tier in `APP_ENV=production` & NSE Endpoints (`TWELVEDATA_PLAN=free`):** Disabled to comply with Twelve Data Terms §2.3 and paid-exchange licensing.
- **GNews Free Tier in Production:** Blocked whenever `APP_ENV=production` OR `GNEWS_DEV_MODE!=true`, even if `GNEWS_API_KEY` is present. For production Indian company announcements, evaluate official NSE/BSE corporate filing feeds or licensed publishers individually.
- **Public-Holiday APIs for NSE Calendar:** Explicitly excluded; Indian gazetted public holidays do not match NSE settlement/trading schedules or special sessions (e.g., Muhurat Trading).

---

## 3. Environment Variables (Server-Side Only)

Add only needed optional variables in backend `.env` (never prefix with `NEXT_PUBLIC_`):

```bash
APP_ENV=development
ALPHA_VANTAGE_API_KEY=
ALPHA_VANTAGE_PLAN=free
TWELVEDATA_API_KEY=
TWELVEDATA_PLAN=free
GNEWS_API_KEY=
GNEWS_DEV_MODE=false
```

---

## 4. Verification Summary

- **Fixture & Unit Tests:** `backend/.venv/Scripts/python.exe -m pytest tests/test_external_providers.py -v` — verifies missing keys, HTTP 429 & HTTP 200 quota/error envelopes, NSE & paid-plan gating, currency/unit mismatches, missing/stale timestamps, TTL cache expiry, concurrent request coalescing (single upstream call for 6 parallel threads), non-promotion to `LIVE`, production exclusion of `GNews`, and secret redaction.
- **Live Free-Endpoint Verification (no-key APIs only):** Direct HTTPS checks succeeded against `api.frankfurter.dev/v1/latest`, `api.worldbank.org/v2`, and `api.mfapi.in` on `2026-11-11`.

