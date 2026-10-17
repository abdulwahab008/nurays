-- The admin audit log and its CSV export, newest first and by date range.
--
-- Built CONCURRENTLY so the table stays readable and writable during the build. Postgres refuses a
-- concurrent build inside a transaction, and Prisma runs a migration file as one script, so each
-- index has a migration of its own.
-- If the build fails, Postgres leaves an INVALID index behind. Recover with:
--   DROP INDEX CONCURRENTLY IF EXISTS "audit_logs_created_at_idx";
--   npx prisma migrate resolve --rolled-back 20261010100004_index_audit_logs_by_date
-- and deploy again.
CREATE INDEX CONCURRENTLY "audit_logs_created_at_idx" ON "audit_logs"("created_at");
