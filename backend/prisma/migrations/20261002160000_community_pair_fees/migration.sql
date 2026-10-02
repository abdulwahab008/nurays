-- CreateTable
CREATE TABLE "community_pair_fees" (
    "id" TEXT NOT NULL,
    "community_a_id" TEXT NOT NULL,
    "community_b_id" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_pair_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_pair_fees_community_b_id_idx" ON "community_pair_fees"("community_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_pair_fees_community_a_id_community_b_id_key" ON "community_pair_fees"("community_a_id", "community_b_id");

-- AddForeignKey
ALTER TABLE "community_pair_fees" ADD CONSTRAINT "community_pair_fees_community_a_id_fkey" FOREIGN KEY ("community_a_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_pair_fees" ADD CONSTRAINT "community_pair_fees_community_b_id_fkey" FOREIGN KEY ("community_b_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One row per pair, in a fixed order, and a real price.
ALTER TABLE "community_pair_fees" ADD CONSTRAINT "community_pair_fees_ordered" CHECK ("community_a_id" < "community_b_id");
ALTER TABLE "community_pair_fees" ADD CONSTRAINT "community_pair_fees_fee_range" CHECK ("fee" >= 0 AND "fee" <= 5000);
