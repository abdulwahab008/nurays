-- Community-based delivery: sellers fix a delivery fee per community, and
-- choose whether the platform's riders or the seller delivers.
--
-- Written to be re-runnable (IF NOT EXISTS / guarded constraints) because this
-- project's environments are built with `prisma db push` and the migration
-- history predates the community tables (see .github/workflows/ci.yml): it
-- assumes "sellers" and "communities" already exist, as they do in any
-- working environment.

-- Existing sellers keep the original behavior (orders go to the rider pool).
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "delivery_provider" TEXT NOT NULL DEFAULT 'platform';

CREATE TABLE IF NOT EXISTS "seller_community_deliveries" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "free_above" DECIMAL(10,2),
    "min_order_amount" DECIMAL(10,2),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_community_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seller_community_deliveries_seller_id_community_id_key"
    ON "seller_community_deliveries"("seller_id", "community_id");
CREATE INDEX IF NOT EXISTS "seller_community_deliveries_community_id_idx"
    ON "seller_community_deliveries"("community_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_community_deliveries_seller_id_fkey') THEN
        ALTER TABLE "seller_community_deliveries"
            ADD CONSTRAINT "seller_community_deliveries_seller_id_fkey"
            FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_community_deliveries_community_id_fkey') THEN
        ALTER TABLE "seller_community_deliveries"
            ADD CONSTRAINT "seller_community_deliveries_community_id_fkey"
            FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
