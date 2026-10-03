-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "rider_bonus" DECIMAL(10,2),
ADD COLUMN     "rider_fee" DECIMAL(10,2),
ADD COLUMN     "rider_latitude" DECIMAL(10,8),
ADD COLUMN     "rider_location_at" TIMESTAMP(3),
ADD COLUMN     "rider_longitude" DECIMAL(11,8);

-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "cash_limit" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "rider_ledger_entries" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "delivery_id" TEXT,
    "order_id" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rider_ledger_entries_rider_id_created_at_idx" ON "rider_ledger_entries"("rider_id", "created_at");

-- CreateIndex
CREATE INDEX "rider_ledger_entries_rider_id_type_idx" ON "rider_ledger_entries"("rider_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "rider_ledger_entries_delivery_id_type_key" ON "rider_ledger_entries"("delivery_id", "type");

-- AddForeignKey
ALTER TABLE "rider_ledger_entries" ADD CONSTRAINT "rider_ledger_entries_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_ledger_entries" ADD CONSTRAINT "rider_ledger_entries_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cash riders already took at the door on delivered cash orders. Deposits were never recorded
-- before this ledger, so it counts as still held (as the rider screen showed) until an admin
-- records what was handed in.
INSERT INTO "rider_ledger_entries" ("id", "rider_id", "type", "amount", "delivery_id", "order_id", "note", "created_at")
SELECT gen_random_uuid()::text, d."rider_id", 'cod_collected', -o."total_amount", d."id", o."id",
       'Cash collected before the rider ledger existed', COALESCE(d."delivery_time", o."delivered_at", NOW())
FROM "deliveries" d
JOIN "orders" o ON o."id" = d."orderId"
WHERE d."status" = 'delivered'
  AND d."rider_id" IS NOT NULL
  AND o."payment_method" = 'cod'
  AND COALESCE(o."payment_collected_by", 'rider') = 'rider'
ON CONFLICT ("delivery_id", "type") DO NOTHING;
