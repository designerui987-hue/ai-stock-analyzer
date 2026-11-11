PROJECT: AI Stock Analyzer (Indian equities, NSE). Goal: ship a trustworthy MVP
that shows REAL, near-real-time data. Stack: Next.js (frontend/), FastAPI (backend/).

HARD RULES
1. NO fake data in user-facing paths. Never use random(), Math.random(), demo
   fixtures, or placeholder indicator values for anything the user sees. If data
   is missing or stale, return an explicit "unavailable" state with a timestamp
   and source. Demo data is allowed only behind DEMO_MODE=true and must show a
   visible "DEMO DATA" banner.
2. NO invented ML. Do not label anything XGBoost/LightGBM/Neural Net/Prophet
   unless a trained model actually produced it. Signals come from documented,
   deterministic rules with a rule_version stored on each signal.
3. SECURITY: every API route derives user identity from the verified session/JWT,
   never from request body or query params. Secrets come from env only; the app
   must fail at startup if a required secret is missing. No default secrets.
   Cron/admin routes require a CRON_SECRET header.
4. One source of truth: PostgreSQL for persistence, Redis for caching.
   Remove duplicate data paths (Next.js Yahoo routes vs FastAPI) and keep one.
5. Every change must include: tests for new logic, a short note of what changed,
   and exact commands to verify it. Run the tests and the build before saying
   "done". If something can't be verified, say so plainly.
6. Work in small steps. Do not refactor unrelated code. Ask before deleting
   files that aren't clearly dead.
7. Every signal and price shown must carry: source, as_of timestamp, and a
   "not investment advice" disclaimer where signals appear.