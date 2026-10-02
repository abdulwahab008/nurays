-- AlterTable
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "seller_id" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotions_seller_id_fkey'
  ) THEN
    ALTER TABLE "promotions" ADD CONSTRAINT "promotions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
