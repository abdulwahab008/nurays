-- Every stored rating is worked out again from the approved reviews, the way review.service.ts keeps them:
-- seeded kitchens carried made-up figures (4.9 from 480 reviews) with no review behind them.
-- A kitchen counts each order once; a dish counts each review.
UPDATE "sellers" s SET
  "rating_average" = COALESCE(r.avg, 0),
  "total_reviews" = COALESCE(r.orders, 0)
FROM "sellers" s2
LEFT JOIN (
  SELECT seller_id, ROUND(AVG(order_rating)::numeric, 2) AS avg, COUNT(*)::int AS orders
  FROM (
    SELECT seller_id, AVG(seller_rating) AS order_rating
    FROM "reviews"
    WHERE is_approved = true AND seller_rating IS NOT NULL
    GROUP BY seller_id, order_id
  ) per_order
  GROUP BY seller_id
) r ON r.seller_id = s2.id
WHERE s.id = s2.id;

UPDATE "products" p SET
  "rating_average" = COALESCE(r.avg, 0),
  "total_reviews" = COALESCE(r.n, 0)
FROM "products" p2
LEFT JOIN (
  SELECT product_id, AVG(product_rating) AS avg, COUNT(*)::int AS n
  FROM "reviews"
  WHERE is_approved = true AND product_id IS NOT NULL
  GROUP BY product_id
) r ON r.product_id = p2.id
WHERE p.id = p2.id;

-- rating_score as in ranking.service.ts refreshRatingScores (prior mean 4.0, weight 5).
UPDATE "sellers" SET "rating_score" = (5 * 4.0 + "rating_average" * "total_reviews") / (5 + "total_reviews");
UPDATE "products" SET "rating_score" = (5 * 4.0 + "rating_average" * "total_reviews") / (5 + "total_reviews");
