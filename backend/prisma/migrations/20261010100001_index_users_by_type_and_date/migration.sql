-- Admin user lists filtered by type, newest first; active-admin lookups (escalations, approvals).
--
-- Built CONCURRENTLY so the table stays readable and writable during the build. Postgres refuses a
-- concurrent build inside a transaction, and Prisma runs a migration file as one script, so each
-- index has a migration of its own.
-- If the build fails, Postgres leaves an INVALID index behind. Recover with:
--   DROP INDEX CONCURRENTLY IF EXISTS "users_user_type_created_at_idx";
--   npx prisma migrate resolve --rolled-back 20261010100001_index_users_by_type_and_date
-- and deploy again.
CREATE INDEX CONCURRENTLY "users_user_type_created_at_idx" ON "users"("user_type", "created_at");
