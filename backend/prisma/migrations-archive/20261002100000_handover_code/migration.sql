-- The customer's handover code, stored on the order (it used to live only on the
-- rider's delivery row, where the rider could read it back from the API).
-- Idempotent.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "handover_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "handover_attempts" INTEGER NOT NULL DEFAULT 0;

-- Orders still in flight keep the code their customer was already shown.
UPDATE "orders" o
SET "handover_code" = d."delivery_otp"
FROM "deliveries" d
WHERE d."orderId" = o."id" AND d."delivery_otp" IS NOT NULL AND o."handover_code" IS NULL;
