-- Add order execution safety, PAPER vs LIVE ledger isolation, exchange metadata,
-- quote freshness tracking, idempotency key deduplication, and Indian fee/slippage columns.

ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'PAPER';
ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "exchange" TEXT NOT NULL DEFAULT 'NSE';
ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "quote_as_of" TEXT;
ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "slippage_bps" DOUBLE PRECISION;
ALTER TABLE "OrderLog" ADD COLUMN IF NOT EXISTS "fees_inr" DOUBLE PRECISION;

CREATE UNIQUE INDEX IF NOT EXISTS "OrderLog_user_id_idempotency_key_key"
  ON "OrderLog"("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "OrderLog_user_id_mode_placed_at_idx"
  ON "OrderLog"("user_id", "mode", "placed_at");

