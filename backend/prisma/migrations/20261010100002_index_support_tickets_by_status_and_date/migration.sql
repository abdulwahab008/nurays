-- The complaints queue by status, and the approvals hub's waiting count and oldest complaint.
--
-- Built CONCURRENTLY so the table stays readable and writable during the build. Postgres refuses a
-- concurrent build inside a transaction, and Prisma runs a migration file as one script, so each
-- index has a migration of its own.
-- If the build fails, Postgres leaves an INVALID index behind. Recover with:
--   DROP INDEX CONCURRENTLY IF EXISTS "support_tickets_status_created_at_idx";
--   npx prisma migrate resolve --rolled-back 20261010100002_index_support_tickets_by_status_and_date
-- and deploy again.
CREATE INDEX CONCURRENTLY "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");
