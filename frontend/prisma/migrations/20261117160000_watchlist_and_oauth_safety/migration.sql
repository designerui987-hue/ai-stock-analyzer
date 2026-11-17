-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthState" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WatchlistItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'NSE',
    "notes" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthState_nonce_key" ON "OAuthState"("nonce");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthState_user_id_expires_at_idx" ON "OAuthState"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WatchlistItem_user_id_symbol_key" ON "WatchlistItem"("user_id", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WatchlistItem_user_id_idx" ON "WatchlistItem"("user_id");

