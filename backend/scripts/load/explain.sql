-- The hot queries of the launch load test, with their plans, on the database the test ran against:
--
--   psql "$DATABASE_URL" -f scripts/load/explain.sql
--
-- Run it before the load test (on the seeded database) and again after, and read the plans: a sequential scan
-- on a large table, a sort that spills, or "Rows Removed by Filter" in the millions is a missing index or a
-- query to rewrite. These mirror the queries the services build (products listing and search, order lists,
-- the rider pool, notifications, the rider ledger, the admin pages); when a service changes, refresh them
-- from pg_stat_statements on staging. Read-only (EXPLAIN ANALYZE runs the SELECTs).
\set ON_ERROR_STOP on
\pset pager off

-- Sample ids: the busiest customer, kitchen and rider, and the user with the most notifications.
SELECT customer_id FROM orders WHERE customer_id IS NOT NULL GROUP BY customer_id ORDER BY count(*) DESC LIMIT 1 \gset
SELECT seller_id FROM order_items GROUP BY seller_id ORDER BY count(*) DESC LIMIT 1 \gset
SELECT rider_id FROM deliveries WHERE rider_id IS NOT NULL GROUP BY rider_id ORDER BY count(*) DESC LIMIT 1 \gset
SELECT user_id AS notified_user FROM notifications GROUP BY user_id ORDER BY count(*) DESC LIMIT 1 \gset
SELECT to_char(current_date, 'YYYY-MM-DD') AS today, extract(dow FROM current_date)::int AS weekday \gset
\echo customer :customer_id kitchen :seller_id rider :rider_id today :today weekday :weekday

\echo '### Q1 products listing, newest first, one page'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT p.id FROM products p LEFT JOIN sellers j0 ON j0.id = p.seller_id
WHERE p.is_active = true AND p.approval_status = 'approved' AND j0.status = 'active'
  AND (p.menu_type = 'fixed' OR (p.menu_type = 'weekly' AND p.available_days @> ARRAY[:weekday]) OR (p.menu_type = 'daily' AND p.menu_date = :'today'))
ORDER BY p.created_at DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '### Q2 products listing, the total behind the pages'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT COUNT(*) FROM products p LEFT JOIN sellers j0 ON j0.id = p.seller_id
WHERE p.is_active = true AND p.approval_status = 'approved' AND j0.status = 'active'
  AND (p.menu_type = 'fixed' OR (p.menu_type = 'weekly' AND p.available_days @> ARRAY[:weekday]) OR (p.menu_type = 'daily' AND p.menu_date = :'today'));

\echo '### Q3 search (ranking.service searchRankedProductIds), term "dish"'
BEGIN;
SET LOCAL pg_trgm.word_similarity_threshold = 0.5;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT x.id, MAX(x.rel) AS rel, BOOL_OR(x.exact) AS exact
FROM (
  SELECT p.id,
         (p.name ILIKE q.pattern OR COALESCE(p.name_urdu, '') ILIKE q.pattern OR COALESCE(p.description, '') ILIKE q.pattern) AS exact,
         (CASE WHEN p.name ILIKE q.prefix THEN 3 WHEN p.name ILIKE q.pattern THEN 2 ELSE 0 END)
           + (CASE WHEN COALESCE(p.name_urdu, '') ILIKE q.pattern THEN 2 ELSE 0 END)
           + (CASE WHEN COALESCE(p.description, '') ILIKE q.pattern THEN 0.5 ELSE 0 END)
           + word_similarity(q.term, p.name) + 0.05 * LEAST(p.trend_score, 10) AS rel
  FROM products p CROSS JOIN unnest(ARRAY['dish'], ARRAY['%dish%'], ARRAY['dish%']) AS q(term, pattern, prefix)
  WHERE p.is_active AND p.approval_status = 'approved'
    AND (p.name ILIKE q.pattern OR COALESCE(p.name_urdu, '') ILIKE q.pattern OR COALESCE(p.description, '') ILIKE q.pattern OR q.term <% p.name)
) x
GROUP BY x.id ORDER BY BOOL_OR(x.exact) DESC, rel DESC, x.id LIMIT 500;
COMMIT;

\echo '### Q4 a customer''s orders, newest first'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM orders WHERE customer_id = :'customer_id' ORDER BY created_at DESC LIMIT 20;

\echo '### Q5 a kitchen''s order lines, newest first'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM order_items WHERE seller_id = :'seller_id' ORDER BY created_at DESC LIMIT 20;

\echo '### Q6 the audit log, newest first (admin page)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 50 OFFSET 0;

\echo '### Q7 the rider pool: open jobs whose order is still live'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT d.id FROM deliveries d LEFT JOIN orders o ON o.id = d."orderId"
WHERE d.rider_id IS NULL AND d.status = 'pending' AND o.order_status NOT IN ('cancelled', 'refunded', 'delivered', 'completed')
ORDER BY d.created_at ASC;

\echo '### Q8 notifications: the first page and the unread count'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM notifications WHERE user_id = :'notified_user' ORDER BY created_at DESC LIMIT 5;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT COUNT(*) FROM notifications WHERE user_id = :'notified_user' AND is_read = false;

\echo '### Q9 a rider''s money by type (every dispatch asks this for the candidates)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT type, SUM(amount) FROM rider_ledger_entries WHERE rider_id = :'rider_id' GROUP BY type;

\echo '### Q10 the ledger, newest first'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM ledger_entries ORDER BY created_at DESC LIMIT 50;

\echo '### Q11 the ops snapshot: jobs in progress'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT COUNT(*) FROM deliveries WHERE status IN ('assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer');

\echo '### Q12 a rider''s jobs, newest first (the dashboard list, up to 200)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM deliveries WHERE rider_id = :'rider_id' ORDER BY created_at DESC LIMIT 200;

\echo '### Q13 the complaints queue'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id FROM support_tickets WHERE status IN ('open', 'in_progress') ORDER BY created_at ASC LIMIT 50;
