-- CreateTable
CREATE TABLE "AlertPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL DEFAULT 'demo_user',
    "channels_enabled" TEXT NOT NULL DEFAULT '{"web_push":true,"telegram":false,"whatsapp":false}',
    "telegram_chat_id" TEXT,
    "whatsapp_number" TEXT,
    "web_push_subscription" TEXT,
    "alert_types_subscribed" TEXT NOT NULL DEFAULT '{"new_signal":true,"target_hit":true,"sl_hit":true,"breakout":true,"risk_warning":true,"watchlist_move":false}',
    "quiet_hours" TEXT NOT NULL DEFAULT '{"enabled":false,"start":"22:00","end":"07:00"}',
    "min_confidence_threshold" REAL NOT NULL DEFAULT 70,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "message_body" TEXT NOT NULL,
    "sent_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_status" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_user_id_key" ON "AlertPreference"("user_id");
