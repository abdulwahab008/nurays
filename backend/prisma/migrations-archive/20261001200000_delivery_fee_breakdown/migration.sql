-- Per-seller split of an order's delivery fee, so a self-delivering seller's fee
-- can be credited to them instead of the platform. Existing orders stay NULL
-- (treated as platform-delivered). Re-runnable.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_fee_breakdown" JSONB;
