-- Riders serve a community; jobs record how they were assigned and who handed them back.
ALTER TABLE "riders" ADD COLUMN "community_id" TEXT;
CREATE INDEX "riders_community_id_idx" ON "riders"("community_id");
ALTER TABLE "riders" ADD CONSTRAINT "riders_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deliveries" ADD COLUMN "assignment_mode" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "released_rider_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Nuray's delivery fee when the kitchen pays it.
ALTER TABLE "orders" ADD COLUMN "seller_delivery_charge" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Menu types: fixed (always), weekly (days of the week), daily (one date).
ALTER TABLE "products" ADD COLUMN "menu_type" TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE "products" ADD COLUMN "available_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "products" ADD COLUMN "menu_date" DATE;
ALTER TABLE "products" ADD CONSTRAINT "products_menu_type_check" CHECK ("menu_type" IN ('fixed', 'weekly', 'daily'));
