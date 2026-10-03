-- AlterTable
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "applicable_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
