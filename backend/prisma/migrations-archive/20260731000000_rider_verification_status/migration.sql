-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "verification_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "rejection_reason" TEXT;
