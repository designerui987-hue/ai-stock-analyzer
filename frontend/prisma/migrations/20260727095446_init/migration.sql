-- CreateTable
CREATE TABLE IF NOT EXISTS "Signal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entry_price" DOUBLE PRECISION NOT NULL,
    "target_price" DOUBLE PRECISION NOT NULL,
    "stop_loss_price" DOUBLE PRECISION NOT NULL,
    "confidence_pct" DOUBLE PRECISION NOT NULL,
    "model_breakdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_price" DOUBLE PRECISION,
    "realized_pnl_pct" DOUBLE PRECISION,
    "horizon_days" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);
