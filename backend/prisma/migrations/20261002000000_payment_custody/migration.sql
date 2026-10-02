-- Who collected each order's money, and who delivers it.
--
-- Seller payouts used to treat every paid non-COD order as money the platform
-- held. Manual transfers go straight into the seller's own account, so those
-- were paid out a second time. Balances are now computed from who actually
-- collected the money (seller-balance.service.ts).
--
-- Idempotent: safe to re-run, and a no-op on databases built with `db push`.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_collected_by" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_provider" TEXT;

-- Who delivers: hub-fulfilled items always go with a platform rider; otherwise the
-- provider snapshotted in the delivery-fee breakdown, falling back to the seller's
-- current setting for orders that predate the snapshot.
UPDATE "orders" o
SET "delivery_provider" = CASE
  WHEN EXISTS (SELECT 1 FROM "order_items" i WHERE i."order_id" = o."id" AND i."fulfillment_type" = 'hub') THEN 'platform'
  WHEN jsonb_typeof(o."delivery_fee_breakdown"::jsonb) = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(o."delivery_fee_breakdown"::jsonb) e WHERE e->>'provider' = 'self') THEN 'self'
  WHEN EXISTS (
    SELECT 1 FROM "order_items" i JOIN "sellers" s ON s."id" = i."seller_id"
    WHERE i."order_id" = o."id" AND s."delivery_provider" = 'self'
  ) AND NOT (jsonb_typeof(o."delivery_fee_breakdown"::jsonb) = 'array'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(o."delivery_fee_breakdown"::jsonb) e WHERE e->>'provider' = 'platform')) THEN 'self'
  ELSE 'platform'
END
WHERE o."delivery_type" = 'home_delivery' AND o."delivery_provider" IS NULL;

-- Who collected the money, for orders already paid.
UPDATE "orders" o
SET "payment_collected_by" = CASE
  WHEN o."payment_method" IN ('wallet', 'safepay', 'card') THEN 'platform'
  WHEN o."payment_method" IN ('jazzcash', 'easypaisa', 'bank') THEN 'seller'
  WHEN o."payment_method" = 'cod' AND o."delivery_type" = 'self_pickup' THEN 'seller'
  WHEN o."payment_method" = 'cod' AND o."delivery_type" = 'hub_pickup' THEN 'platform'
  WHEN o."payment_method" = 'cod' AND o."delivery_provider" = 'self' THEN 'seller'
  WHEN o."payment_method" = 'cod' THEN 'rider'
  ELSE NULL
END
WHERE o."paid_at" IS NOT NULL AND o."payment_collected_by" IS NULL;
