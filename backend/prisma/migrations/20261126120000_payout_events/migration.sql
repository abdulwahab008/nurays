-- The payout log: every step of every payout, append-only, and the kitchen's confirmation that the money arrived.
ALTER TABLE "seller_payouts" ADD COLUMN "kitchen_confirmation" TEXT,
ADD COLUMN "kitchen_confirmed_at" TIMESTAMP(3);
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_kitchen_confirmation" CHECK ("kitchen_confirmation" IS NULL OR "kitchen_confirmation" IN ('received', 'not_received'));

CREATE TABLE "payout_events" (
    "id" TEXT NOT NULL,
    "payout_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_events_event" CHECK ("event" IN ('created', 'sent', 'failed', 'received', 'not_received', 'payment_received')),
    CONSTRAINT "payout_events_actor_type" CHECK ("actor_type" IN ('system', 'admin', 'kitchen'))
);

CREATE INDEX "payout_events_payout_id_created_at_idx" ON "payout_events"("payout_id", "created_at");

ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "seller_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nothing in the log is ever changed or removed.
CREATE FUNCTION payout_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payout_events is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payout_events_no_update BEFORE UPDATE ON "payout_events" FOR EACH ROW EXECUTE FUNCTION payout_events_append_only();
CREATE TRIGGER payout_events_no_delete BEFORE DELETE ON "payout_events" FOR EACH ROW EXECUTE FUNCTION payout_events_append_only();

-- The history of payouts made before the log, from what each payout row records.
INSERT INTO "payout_events" ("id", "payout_id", "event", "actor_type", "actor_id", "reference", "note", "created_at")
SELECT gen_random_uuid()::text, p.id,
       CASE WHEN p.net_amount < 0 THEN 'payment_received' ELSE 'created' END,
       CASE WHEN p.net_amount < 0 THEN 'admin' WHEN (p.account_details ->> 'automatic') = 'true' THEN 'system' ELSE 'kitchen' END,
       CASE WHEN p.net_amount < 0 THEN p.account_details ->> 'recordedBy' ELSE NULL END,
       CASE WHEN p.net_amount < 0 THEN p.transaction_id ELSE NULL END,
       'Recorded before the payout log',
       p.created_at
FROM "seller_payouts" p;

INSERT INTO "payout_events" ("id", "payout_id", "event", "actor_type", "reference", "note", "created_at")
SELECT gen_random_uuid()::text, p.id, CASE WHEN p.status = 'completed' THEN 'sent' ELSE 'failed' END, 'admin', p.transaction_id,
       CASE WHEN p.status = 'failed' THEN p.failed_reason ELSE 'Recorded before the payout log' END,
       COALESCE(p.processed_at, p.updated_at)
FROM "seller_payouts" p
WHERE p.net_amount > 0 AND p.status IN ('completed', 'failed');

