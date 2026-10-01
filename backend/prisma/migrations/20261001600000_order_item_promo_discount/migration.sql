-- Per-item share of an order's manual-code discount, so partial cancels refund exactly.
-- Existing rows default to 0 (legacy orders fall back to the proportional split in code).
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0;
