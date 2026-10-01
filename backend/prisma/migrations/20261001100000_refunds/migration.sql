-- Refund records: money owed back to a customer (see the Refund model).
-- Re-runnable, and assumes "orders" already exists (environments are built with
-- `prisma db push`; see the note in 20261001000000_community_delivery_and_provider).

CREATE TABLE IF NOT EXISTS "refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "reference" TEXT,
    "created_by" TEXT,
    "processed_by" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refunds_order_id_idx" ON "refunds"("order_id");
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_order_id_fkey') THEN
        ALTER TABLE "refunds"
            ADD CONSTRAINT "refunds_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
