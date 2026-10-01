-- Which hub batches an order's units were taken from, so a cancelled order's stock
-- goes back to the same batches. Re-runnable; assumes "orders" and "hub_inventory" exist.

CREATE TABLE IF NOT EXISTS "hub_batch_allocations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "hub_inventory_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_batch_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hub_batch_allocations_order_id_product_id_idx" ON "hub_batch_allocations"("order_id", "product_id");
CREATE INDEX IF NOT EXISTS "hub_batch_allocations_hub_inventory_id_idx" ON "hub_batch_allocations"("hub_inventory_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_batch_allocations_order_id_fkey') THEN
        ALTER TABLE "hub_batch_allocations" ADD CONSTRAINT "hub_batch_allocations_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_batch_allocations_hub_inventory_id_fkey') THEN
        ALTER TABLE "hub_batch_allocations" ADD CONSTRAINT "hub_batch_allocations_hub_inventory_id_fkey"
            FOREIGN KEY ("hub_inventory_id") REFERENCES "hub_inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
