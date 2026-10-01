-- Fixture: legacy rows that the 20261001300000 clean-up must handle.
-- Run against a `prisma db push` database; FK checks are off so only the columns that matter are filled.
SET session_replication_role = replica;
DROP INDEX IF EXISTS "reviews_order_item_id_customer_id_key";
DROP INDEX IF EXISTS "promotion_usages_promotion_id_order_id_key";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_stock_quantity_nonneg";
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_balance_nonneg";

INSERT INTO sellers (id, user_id, business_name, updated_at) VALUES ('s1','u1','S',NOW());
INSERT INTO products (id, seller_id, name, slug, price, unit, stock_quantity, updated_at) VALUES ('p1','s1','P','p',1,'pc',-5,NOW());
INSERT INTO wallets (id, user_id, balance, updated_at) VALUES ('w1','u1',-10,NOW());
-- three reviews of the same item by the same customer: 5, 1, 1 -> only the 5 survives
INSERT INTO reviews (id, order_id, order_item_id, customer_id, seller_id, product_id, product_rating, seller_rating, is_approved, created_at, updated_at) VALUES
 ('r1','o','oi','c','s1','p1',5,5,true,'2026-01-01',NOW()),
 ('r2','o','oi','c','s1','p1',1,1,true,'2026-01-02',NOW()),
 ('r3','o','oi','c','s1','p1',1,1,true,'2026-01-03',NOW());
UPDATE products SET rating_average = 2.33, total_reviews = 3 WHERE id = 'p1';
UPDATE sellers SET rating_average = 2.33, total_reviews = 3 WHERE id = 's1';
INSERT INTO promotions (id, code, name, discount_type, discount_value, valid_from, valid_until, used_count, updated_at) VALUES
 ('pr1','X','X','percentage',10,NOW(),NOW(),3,NOW()), ('pr2','Y','Y','percentage',10,NOW(),NOW(),7,NOW());
INSERT INTO promotion_usages (id, promotion_id, user_id, order_id, discount_applied, used_at) VALUES
 ('a1','pr1','u','o1',5,'2026-01-01'), ('a2','pr1','u','o1',5,'2026-01-02'), ('a3','pr1','u','o1',5,'2026-01-03');
