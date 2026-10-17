-- An order's complaints on the admin order page (order_id is a foreign key that had no index).
--
-- Built CONCURRENTLY so the table stays readable and writable during the build. Postgres refuses a
-- concurrent build inside a transaction, and Prisma runs a migration file as one script, so each
-- index has a migration of its own.
-- If the build fails, Postgres leaves an INVALID index behind. Recover with:
--   DROP INDEX CONCURRENTLY IF EXISTS "support_tickets_order_id_idx";
--   npx prisma migrate resolve --rolled-back 20261010100003_index_support_tickets_by_order
-- and deploy again.
CREATE INDEX CONCURRENTLY "support_tickets_order_id_idx" ON "support_tickets"("order_id");
