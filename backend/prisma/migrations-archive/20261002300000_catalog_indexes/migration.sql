-- Indexes for the public catalog and for per-seller date queries.
-- Idempotent: safe on databases that already have some of these.

-- Case-insensitive "contains" search on products uses trigram indexes.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- The catalog filter (approved + active) in its default newest-first order.
-- Replaces the (approval_status, is_active) index, which it covers.
CREATE INDEX IF NOT EXISTS "products_approval_status_is_active_created_at_idx"
  ON "products"("approval_status", "is_active", "created_at" DESC);
DROP INDEX IF EXISTS "products_approval_status_is_active_idx";

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_name_urdu_trgm_idx" ON "products" USING GIN ("name_urdu" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_description_trgm_idx" ON "products" USING GIN ("description" gin_trgm_ops);

-- A seller's order items by date (daily order caps, dashboards, reports).
-- Replaces the seller_id index, which it covers.
CREATE INDEX IF NOT EXISTS "order_items_seller_id_created_at_idx" ON "order_items"("seller_id", "created_at");
DROP INDEX IF EXISTS "order_items_seller_id_idx";
