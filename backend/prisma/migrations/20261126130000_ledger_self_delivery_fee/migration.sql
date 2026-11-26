-- A self-delivering kitchen that collected the payment itself had its delivery fee left out of the ledger, so the
-- order's debits (the whole payment, fee included) exceeded its credits by the fee. It is now credited like any other
-- self-delivery fee (ledger.service.ts, entry 5). This adds it to the orders posted before, one entry per kitchen
-- that still had something to deliver, and only where the order has no self-delivery fee entry yet.
CREATE TEMP TABLE "self_fee_fixed" ON COMMIT DROP AS
SELECT DISTINCT o.id AS order_id
FROM "orders" o
WHERE o.payment_collected_by = 'seller'
  AND jsonb_typeof(o.delivery_fee_breakdown) = 'array'
  AND EXISTS (SELECT 1 FROM "ledger_entries" l WHERE l.order_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM "ledger_entries" l WHERE l.order_id = o.id AND l.transaction_type = 'seller_delivery_fee');

INSERT INTO "ledger_entries" ("id", "order_id", "transaction_type", "account_type", "entry_type", "amount", "currency", "description", "seller_id", "created_at")
SELECT
  gen_random_uuid()::text,
  o.id,
  'seller_delivery_fee',
  'liability',
  'credit',
  (b ->> 'fee')::numeric,
  'PKR',
  'Self-delivery fee for Order #' || o.order_number || ', kept from the payment the seller collected (added for an order posted before)',
  b ->> 'sellerId',
  CURRENT_TIMESTAMP
FROM "orders" o
JOIN "self_fee_fixed" f ON f.order_id = o.id
CROSS JOIN LATERAL jsonb_array_elements(o.delivery_fee_breakdown) b
WHERE b ->> 'provider' = 'self'
  AND (b ->> 'fee')::numeric > 0
  AND EXISTS (SELECT 1 FROM "order_items" i WHERE i.order_id = o.id AND i.seller_id = b ->> 'sellerId' AND i.status <> 'cancelled');

-- On an order with a Nuray-paid discount the discount entry was worked out without the fee, so it came out short by
-- as much; it is topped up so the order balances again.
INSERT INTO "ledger_entries" ("id", "order_id", "transaction_type", "account_type", "entry_type", "amount", "currency", "description", "created_at")
SELECT gen_random_uuid()::text, o.id, 'platform_discount', 'expense', 'debit', t.gap, 'PKR',
  'Discount paid by Nuray on Order #' || o.order_number || ' (correction with the self-delivery fee)', CURRENT_TIMESTAMP
FROM "orders" o
JOIN "self_fee_fixed" f ON f.order_id = o.id
CROSS JOIN LATERAL (
  SELECT SUM(CASE WHEN l.entry_type = 'credit' THEN l.amount ELSE -l.amount END) AS gap
  FROM "ledger_entries" l WHERE l.order_id = o.id
) t
WHERE o.discount_amount > 0 AND t.gap > 0.009;
