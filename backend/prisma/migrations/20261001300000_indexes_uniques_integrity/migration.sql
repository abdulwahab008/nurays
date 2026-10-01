-- Indexes, uniqueness and referential-integrity fixes from the schema review.
--
-- Re-runnable (IF NOT EXISTS / guarded), and assumes the tables already exist:
-- environments are built with `prisma db push` and the migration history
-- predates much of the schema (see the note in 20261001000000_*).
--
-- 1. Remove data that would violate the new constraints.
-- 2. Add the indexes / uniques / foreign keys.
-- 3. Add CHECK constraints (NOT VALID: enforced for every new write without
--    scanning or failing on legacy rows). Prisma has no syntax for CHECKs, so
--    they live only here and are not created by `prisma db push`.

-- ---------------------------------------------------------------------------
-- 1. Clean-up
-- ---------------------------------------------------------------------------

-- One review per customer per purchased item: keep the earliest of any duplicates.
DELETE FROM "reviews" r
USING "reviews" keep
WHERE r."order_item_id" = keep."order_item_id"
  AND r."customer_id" = keep."customer_id"
  AND (r."created_at", r."id") > (keep."created_at", keep."id");

-- One usage row per promotion per order: keep the earliest, then re-derive the
-- promotion counters that those duplicates inflated.
DELETE FROM "promotion_usages" p
USING "promotion_usages" keep
WHERE p."promotion_id" = keep."promotion_id"
  AND p."order_id" = keep."order_id"
  AND (p."used_at", p."id") > (keep."used_at", keep."id");

UPDATE "promotions" pr
SET "used_count" = (SELECT COUNT(*) FROM "promotion_usages" u WHERE u."promotion_id" = pr."id")
WHERE pr."used_count" <> (SELECT COUNT(*) FROM "promotion_usages" u WHERE u."promotion_id" = pr."id");

-- Hub managers that point at a user that no longer exists.
UPDATE "hub_centers" SET "manager_id" = NULL
WHERE "manager_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "hub_centers"."manager_id");

-- ---------------------------------------------------------------------------
-- 2. Indexes, uniques, foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_seller_id_fkey";
ALTER TABLE "seller_payouts" DROP CONSTRAINT IF EXISTS "seller_payouts_seller_id_fkey";
DROP INDEX IF EXISTS "product_variants_sku_key";
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "cart_items_cart_id_idx" ON "cart_items"("cart_id");
CREATE INDEX IF NOT EXISTS "cart_items_product_id_idx" ON "cart_items"("product_id");
CREATE INDEX IF NOT EXISTS "categories_parent_id_idx" ON "categories"("parent_id");
CREATE INDEX IF NOT EXISTS "category_requests_seller_id_idx" ON "category_requests"("seller_id");
CREATE INDEX IF NOT EXISTS "deliveries_rider_id_status_idx" ON "deliveries"("rider_id", "status");
CREATE INDEX IF NOT EXISTS "hub_centers_manager_id_idx" ON "hub_centers"("manager_id");
CREATE INDEX IF NOT EXISTS "hub_inventory_product_id_idx" ON "hub_inventory"("product_id");
CREATE INDEX IF NOT EXISTS "hub_inventory_seller_id_idx" ON "hub_inventory"("seller_id");
CREATE INDEX IF NOT EXISTS "hub_inventory_hub_id_status_expiry_date_idx" ON "hub_inventory"("hub_id", "status", "expiry_date");
CREATE INDEX IF NOT EXISTS "hub_inventory_logs_hub_inventory_id_idx" ON "hub_inventory_logs"("hub_inventory_id");
CREATE INDEX IF NOT EXISTS "hub_temperature_logs_hub_id_idx" ON "hub_temperature_logs"("hub_id");
CREATE INDEX IF NOT EXISTS "inventory_reservations_product_id_idx" ON "inventory_reservations"("product_id");
CREATE INDEX IF NOT EXISTS "inventory_reservations_reservation_id_idx" ON "inventory_reservations"("reservation_id");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX IF NOT EXISTS "order_items_seller_id_idx" ON "order_items"("seller_id");
CREATE INDEX IF NOT EXISTS "order_items_product_id_idx" ON "order_items"("product_id");
CREATE INDEX IF NOT EXISTS "order_messages_order_id_created_at_idx" ON "order_messages"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "order_status_history_order_id_idx" ON "order_status_history"("order_id");
CREATE INDEX IF NOT EXISTS "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "orders_order_status_idx" ON "orders"("order_status");
CREATE INDEX IF NOT EXISTS "orders_payment_status_idx" ON "orders"("payment_status");
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX IF NOT EXISTS "otp_verifications_phone_purpose_created_at_idx" ON "otp_verifications"("phone", "purpose", "created_at");
CREATE INDEX IF NOT EXISTS "product_images_product_id_idx" ON "product_images"("product_id");
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants"("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");
CREATE INDEX IF NOT EXISTS "products_seller_id_idx" ON "products"("seller_id");
CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products"("category_id");
CREATE INDEX IF NOT EXISTS "products_approval_status_is_active_idx" ON "products"("approval_status", "is_active");
CREATE INDEX IF NOT EXISTS "promotion_usages_promotion_id_user_id_idx" ON "promotion_usages"("promotion_id", "user_id");
CREATE INDEX IF NOT EXISTS "promotion_usages_order_id_idx" ON "promotion_usages"("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "promotion_usages_promotion_id_order_id_key" ON "promotion_usages"("promotion_id", "order_id");
CREATE INDEX IF NOT EXISTS "promotions_seller_id_idx" ON "promotions"("seller_id");
CREATE INDEX IF NOT EXISTS "reviews_seller_id_idx" ON "reviews"("seller_id");
CREATE INDEX IF NOT EXISTS "reviews_product_id_idx" ON "reviews"("product_id");
CREATE INDEX IF NOT EXISTS "reviews_customer_id_idx" ON "reviews"("customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_order_item_id_customer_id_key" ON "reviews"("order_item_id", "customer_id");
CREATE INDEX IF NOT EXISTS "riders_status_verification_status_idx" ON "riders"("status", "verification_status");
CREATE INDEX IF NOT EXISTS "search_queries_user_id_idx" ON "search_queries"("user_id");
CREATE INDEX IF NOT EXISTS "seller_badges_seller_id_idx" ON "seller_badges"("seller_id");
CREATE INDEX IF NOT EXISTS "seller_documents_seller_id_idx" ON "seller_documents"("seller_id");
CREATE INDEX IF NOT EXISTS "seller_payouts_seller_id_status_idx" ON "seller_payouts"("seller_id", "status");
CREATE INDEX IF NOT EXISTS "sellers_community_id_idx" ON "sellers"("community_id");
CREATE INDEX IF NOT EXISTS "sellers_status_verification_status_idx" ON "sellers"("status", "verification_status");
CREATE INDEX IF NOT EXISTS "stock_alerts_seller_id_idx" ON "stock_alerts"("seller_id");
CREATE INDEX IF NOT EXISTS "stock_alerts_product_id_idx" ON "stock_alerts"("product_id");
CREATE INDEX IF NOT EXISTS "support_messages_ticket_id_idx" ON "support_messages"("ticket_id");
CREATE INDEX IF NOT EXISTS "support_tickets_user_id_idx" ON "support_tickets"("user_id");
CREATE INDEX IF NOT EXISTS "user_activity_logs_user_id_created_at_idx" ON "user_activity_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_addresses_user_id_idx" ON "user_addresses"("user_id");
CREATE INDEX IF NOT EXISTS "user_addresses_community_id_idx" ON "user_addresses"("community_id");
CREATE INDEX IF NOT EXISTS "users_primary_community_id_idx" ON "users"("primary_community_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_transactions_order_id_idx" ON "wallet_transactions"("order_id");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_centers_manager_id_fkey') THEN
        ALTER TABLE "hub_centers" ADD CONSTRAINT "hub_centers_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_seller_id_fkey') THEN
        ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_payouts_seller_id_fkey') THEN
        ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. CHECK constraints (stock and balances can never go negative)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_nonneg') THEN
        ALTER TABLE "products" ADD CONSTRAINT "products_stock_quantity_nonneg" CHECK ("stock_quantity" >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_stock_quantity_nonneg') THEN
        ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_quantity_nonneg" CHECK ("stock_quantity" >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_nonneg') THEN
        ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nonneg" CHECK ("balance" >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_inventory_quantity_nonneg') THEN
        ALTER TABLE "hub_inventory" ADD CONSTRAINT "hub_inventory_quantity_nonneg" CHECK ("quantity" >= 0) NOT VALID;
    END IF;
END $$;

