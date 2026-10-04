-- CreateTable
CREATE TABLE "rider_documents" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rider_documents_rider_id_idx" ON "rider_documents"("rider_id");

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
