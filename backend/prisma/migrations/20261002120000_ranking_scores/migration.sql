-- AlterTable
ALTER TABLE "products" ADD COLUMN     "rating_score" DOUBLE PRECISION NOT NULL DEFAULT 4,
ADD COLUMN     "trend_score" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "rating_score" DOUBLE PRECISION NOT NULL DEFAULT 4,
ADD COLUMN     "trend_score" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_trend_score_idx" ON "products"("trend_score" DESC);


-- Backfill: rating pulled towards 4.0 as if it had 5 extra average reviews (see ranking.service.ts).
UPDATE "products" SET "rating_score" = (5 * 4.0 + "rating_average" * "total_reviews") / (5 + "total_reviews");
UPDATE "sellers" SET "rating_score" = (5 * 4.0 + "rating_average" * "total_reviews") / (5 + "total_reviews");
