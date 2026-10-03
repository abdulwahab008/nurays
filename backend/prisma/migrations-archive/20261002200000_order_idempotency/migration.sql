-- Duplicate-order protection: one order per (customer, checkout attempt key).
-- Idempotent. NULL keys never collide (orders placed without a key).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_customer_id_idempotency_key_key" ON "orders"("customer_id", "idempotency_key");
