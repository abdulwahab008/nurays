-- MONEY-7: the fingerprint of what a checkout with an Idempotency-Key asked for, so a reused key with a different
-- basket is refused instead of silently answered with the earlier order. Additive and nullable: orders placed before
-- it have none and are answered as before; nothing is backfilled.
ALTER TABLE "orders" ADD COLUMN "idempotency_fingerprint" CHAR(64);
