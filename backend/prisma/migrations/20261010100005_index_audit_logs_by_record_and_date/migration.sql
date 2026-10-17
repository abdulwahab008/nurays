-- One record's history (the order investigation page) and the staff sign-in lock count.
--
-- Built CONCURRENTLY so the table stays readable and writable during the build. Postgres refuses a
-- concurrent build inside a transaction, and Prisma runs a migration file as one script, so each
-- index has a migration of its own.
-- If the build fails, Postgres leaves an INVALID index behind. Recover with:
--   DROP INDEX CONCURRENTLY IF EXISTS "audit_logs_entity_id_created_at_idx";
--   npx prisma migrate resolve --rolled-back 20261010100005_index_audit_logs_by_record_and_date
-- and deploy again.
CREATE INDEX CONCURRENTLY "audit_logs_entity_id_created_at_idx" ON "audit_logs"("entity_id", "created_at");
