-- Versioned migration: remove legacy unique-display-name restriction and broaden paper order index

-- 1. Remove legacy unique constraint and unique index on users.username if existing
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";
DROP INDEX IF EXISTS "ix_users_username";
CREATE INDEX IF NOT EXISTS "ix_users_username" ON "users"("username");

-- 2. Broaden pending paper order watch index to include all executable order types (LIMIT, SL, SL_M, MARKET)
DROP INDEX IF EXISTS "OrderLog_pending_paper_limit_idx";
CREATE INDEX IF NOT EXISTS "OrderLog_pending_paper_orders_idx"
    ON "OrderLog"("user_id", "exchange", "symbol")
    WHERE "mode" = 'PAPER' AND "broker" = 'PAPER' AND "status" = 'OPEN';
