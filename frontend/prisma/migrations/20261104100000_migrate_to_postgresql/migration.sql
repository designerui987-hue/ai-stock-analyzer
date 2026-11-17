-- CreateTable
CREATE TABLE "Signal" (
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
    "rule_version" TEXT NOT NULL DEFAULT 'v1.0-deterministic-quant',
    "source" TEXT NOT NULL DEFAULT 'yfinance',
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertPreference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL DEFAULT 'demo_user',
    "channels_enabled" TEXT NOT NULL DEFAULT '{"web_push":true,"telegram":false,"whatsapp":false}',
    "telegram_chat_id" TEXT,
    "whatsapp_number" TEXT,
    "web_push_subscription" TEXT,
    "alert_types_subscribed" TEXT NOT NULL DEFAULT '{"new_signal":true,"target_hit":true,"sl_hit":true,"breakout":true,"risk_warning":true,"watchlist_move":false}',
    "quiet_hours" TEXT NOT NULL DEFAULT '{"enabled":false,"start":"22:00","end":"07:00"}',
    "min_confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "message_body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_status" TEXT NOT NULL,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL DEFAULT 'demo_user',
    "broker" TEXT NOT NULL DEFAULT 'KITE',
    "access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'KITE',
    "symbol" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "order_type" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "trigger_price" DOUBLE PRECISION,
    "product_type" TEXT NOT NULL,
    "source" TEXT,
    "broker_order_id" TEXT,
    "status" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_raw" TEXT NOT NULL,

    CONSTRAINT "OrderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_user_id_key" ON "AlertPreference"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerConnection_user_id_key" ON "BrokerConnection"("user_id");
