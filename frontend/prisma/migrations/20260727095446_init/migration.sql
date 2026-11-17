-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entry_price" REAL NOT NULL,
    "target_price" REAL NOT NULL,
    "stop_loss_price" REAL NOT NULL,
    "confidence_pct" REAL NOT NULL,
    "model_breakdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closed_at" DATETIME,
    "closed_price" REAL,
    "realized_pnl_pct" REAL,
    "horizon_days" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL
);
