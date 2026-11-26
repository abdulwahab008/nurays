-- Riders deposit the cash they collected into Nuray's account and submit the receipt; an admin approves or rejects it.
CREATE TABLE "rider_cash_deposits" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "kept_as_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "transaction_ref" TEXT NOT NULL,
    "receipt_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_cash_deposits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rider_cash_deposits_amounts" CHECK ("amount" > 0 AND "kept_as_pay" >= 0),
    CONSTRAINT "rider_cash_deposits_status" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "rider_cash_deposits_method" CHECK ("method" IN ('bank_transfer', 'jazzcash', 'easypaisa'))
);

CREATE INDEX "rider_cash_deposits_status_created_at_idx" ON "rider_cash_deposits"("status", "created_at");
CREATE INDEX "rider_cash_deposits_rider_id_created_at_idx" ON "rider_cash_deposits"("rider_id", "created_at");

ALTER TABLE "rider_cash_deposits" ADD CONSTRAINT "rider_cash_deposits_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
