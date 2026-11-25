-- GST the customer paid is now posted as a payable to the tax office (ledger.service.ts, entry 6). This adds it to the
-- orders posted before, by the same rule: the order's tax, or after a refund the tax on the dishes still sold, never
-- more than the customer paid net of refunds. Orders that already have the entry are left alone.
INSERT INTO "ledger_entries" ("id", "order_id", "transaction_type", "account_type", "entry_type", "amount", "currency", "description", "created_at")
SELECT
  gen_random_uuid()::text,
  o.id,
  'gst_payable',
  'liability',
  'credit',
  LEAST(
    GREATEST(o.total_amount - r.refunded, 0),
    ROUND(o.tax_amount * CASE WHEN r.refunded > 0 AND g.all_goods > 0 THEN g.live_goods / g.all_goods ELSE 1 END, 2)
  ),
  'PKR',
  'GST (5%) collected for Order #' || o.order_number || ', payable to the tax office (added for an order posted before GST entries)',
  CURRENT_TIMESTAMP
FROM "orders" o
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(f.amount), 0) AS refunded FROM "refunds" f WHERE f.order_id = o.id AND f.status <> 'failed'
) r
CROSS JOIN LATERAL (
  SELECT
    COALESCE(SUM(i.total_price - i.promo_discount), 0) AS all_goods,
    COALESCE(SUM(i.total_price - i.promo_discount) FILTER (WHERE i.status <> 'cancelled'), 0) AS live_goods
  FROM "order_items" i WHERE i.order_id = o.id
) g
WHERE o.tax_amount > 0
  AND EXISTS (SELECT 1 FROM "ledger_entries" l WHERE l.order_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l WHERE l.order_id = o.id AND l.transaction_type = 'gst_payable')
  AND LEAST(GREATEST(o.total_amount - r.refunded, 0), ROUND(o.tax_amount * CASE WHEN r.refunded > 0 AND g.all_goods > 0 THEN g.live_goods / g.all_goods ELSE 1 END, 2)) > 0;
