-- The original OrderLog records identified their execution mode by broker.
UPDATE "OrderLog" SET "mode" = 'LIVE' WHERE "broker" = 'KITE' AND "mode" = 'PAPER';

CREATE INDEX "OrderLog_pending_paper_limit_idx"
    ON "OrderLog"("user_id", "exchange", "symbol")
    WHERE "mode" = 'PAPER' AND "broker" = 'PAPER' AND "status" = 'OPEN' AND "order_type" = 'LIMIT';
