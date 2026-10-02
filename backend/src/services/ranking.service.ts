import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../utils/logger';
import {
  orderAgainScores,
  RATING_PRIOR,
  recommend,
  RecommendationReason,
  TREND,
  trendScores,
} from '../utils/ranking';

/**
 * Ranking: trending kitchens and dishes, trustworthy ratings, search relevance and
 * recommendations. The formulas live in utils/ranking.ts; this file feeds them real orders
 * and stores the scores the listings sort by (products/sellers .trend_score, .rating_score).
 */

/** Orders that count as real demand: not cancelled or failed, not an unpaid online checkout. */
const COUNTED_ORDER = Prisma.sql`
  o.order_status NOT IN ('cancelled', 'refunded', 'delivery_failed')
  AND NOT (o.payment_method = 'online' AND o.payment_status NOT IN ('paid', 'completed'))`;

/**
 * Recompute every trend score from the last two weeks of orders. Runs every 15 minutes
 * (scheduled in index.ts) and is cheap: one pass over recent order lines.
 */
export async function recomputeTrendScores(now = new Date()): Promise<{ kitchens: number; dishes: number }> {
  const since = new Date(now.getTime() - TREND.windowDays * 24 * 3600 * 1000);
  const rows = await prisma.$queryRaw<Array<{ order_id: string; product_id: string | null; seller_id: string; customer_id: string | null; created_at: Date }>>`
    SELECT oi.order_id, oi.product_id, oi.seller_id, o.customer_id, o.created_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN sellers s ON s.id = oi.seller_id
    WHERE o.created_at >= ${since}
      AND ${COUNTED_ORDER}
      AND oi.status <> 'cancelled'
      -- A kitchen ordering from itself isn't demand.
      AND (o.customer_id IS NULL OR o.customer_id <> s.user_id)`;

  // Kitchens: one event per order (an order of five dishes is still one order).
  const seenOrderSeller = new Set<string>();
  const kitchenEvents = [];
  const dishEvents = [];
  for (const r of rows) {
    const k = `${r.order_id}:${r.seller_id}`;
    if (!seenOrderSeller.has(k)) {
      seenOrderSeller.add(k);
      kitchenEvents.push({ key: r.seller_id, customerId: r.customer_id, at: r.created_at });
    }
    if (r.product_id) dishEvents.push({ key: r.product_id, customerId: r.customer_id, at: r.created_at });
  }
  const kitchens = [...trendScores(kitchenEvents, now)].filter(([, t]) => t.score > 0);
  const dishes = [...trendScores(dishEvents, now)].filter(([, t]) => t.score > 0);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE sellers SET trend_score = 0 WHERE trend_score <> 0`;
    await tx.$executeRaw`UPDATE products SET trend_score = 0 WHERE trend_score <> 0`;
    if (kitchens.length) {
      await tx.$executeRaw`
        -- × qualityFactor(rating_score), as in utils/ranking.ts
        UPDATE sellers s SET trend_score = v.score * (0.5 + 0.5 * LEAST(GREATEST((s.rating_score - 2.5) / 2.5, 0), 1))
        FROM (SELECT unnest(${kitchens.map(([id]) => id)}::text[]) AS id, unnest(${kitchens.map(([, t]) => t.score)}::float8[]) AS score) v
        WHERE s.id = v.id`;
    }
    if (dishes.length) {
      await tx.$executeRaw`
        UPDATE products p SET trend_score = v.score * (0.5 + 0.5 * LEAST(GREATEST((p.rating_score - 2.5) / 2.5, 0), 1))
        FROM (SELECT unnest(${dishes.map(([id]) => id)}::text[]) AS id, unnest(${dishes.map(([, t]) => t.score)}::float8[]) AS score) v
        WHERE p.id = v.id`;
    }
  });
  return { kitchens: kitchens.length, dishes: dishes.length };
}

/** Rating scores for everything (the scheduled job), or for one dish/kitchen after a review. */
export async function refreshRatingScores(only?: { productId?: string | null; sellerId?: string | null }) {
  const m = RATING_PRIOR.mean;
  const w = RATING_PRIOR.weight;
  if (!only) {
    await prisma.$executeRaw`UPDATE products SET rating_score = (${w}::float8 * ${m}::float8 + rating_average * total_reviews) / (${w}::float8 + total_reviews)`;
    await prisma.$executeRaw`UPDATE sellers SET rating_score = (${w}::float8 * ${m}::float8 + rating_average * total_reviews) / (${w}::float8 + total_reviews)`;
    return;
  }
  if (only.productId) {
    await prisma.$executeRaw`UPDATE products SET rating_score = (${w}::float8 * ${m}::float8 + rating_average * total_reviews) / (${w}::float8 + total_reviews) WHERE id = ${only.productId}`;
  }
  if (only.sellerId) {
    await prisma.$executeRaw`UPDATE sellers SET rating_score = (${w}::float8 * ${m}::float8 + rating_average * total_reviews) / (${w}::float8 + total_reviews) WHERE id = ${only.sellerId}`;
  }
}

export async function recomputeRankings() {
  const started = Date.now();
  await refreshRatingScores();
  const counts = await recomputeTrendScores();
  logger.info({ ...counts, ms: Date.now() - started }, 'Ranking scores updated');
  return counts;
}

/**
 * Search relevance: dish ids matching any of the terms, best first. Matches in the name beat
 * matches in the description, and a name starting with the term beats one containing it.
 * Near-misses ("biryni", "nihary") are found through trigram similarity, but only added when
 * there are few real matches, so a good search isn't padded with look-alikes.
 */
const FUZZY_WHEN_FEWER_THAN = 5;

export async function searchRankedProductIds(terms: string[], max = 500): Promise<string[]> {
  const clean = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0).slice(0, 8);
  if (clean.length === 0) return [];
  const likes = clean.map((t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const prefixes = clean.map((t) => `${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  // Short dish names need a looser match than pg_trgm's default 0.6 ("biryni" vs "biryani"
  // is 0.57); set for this query only, so the trigram index still serves the search.
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.5`;
    return tx.$queryRaw<Array<{ id: string; rel: number; exact: boolean }>>`
      SELECT x.id, MAX(x.rel) AS rel, BOOL_OR(x.exact) AS exact FROM (
        SELECT p.id,
          (p.name ILIKE q.pattern OR COALESCE(p.name_urdu, '') ILIKE q.pattern OR COALESCE(p.description, '') ILIKE q.pattern) AS exact,
          (CASE WHEN p.name ILIKE q.prefix THEN 3 WHEN p.name ILIKE q.pattern THEN 2 ELSE 0 END)
          + (CASE WHEN COALESCE(p.name_urdu, '') ILIKE q.pattern THEN 2 ELSE 0 END)
          + (CASE WHEN COALESCE(p.description, '') ILIKE q.pattern THEN 0.5 ELSE 0 END)
          + word_similarity(q.term, p.name)
          + 0.05 * LEAST(p.trend_score, 10) AS rel
        FROM products p
        CROSS JOIN unnest(${clean}::text[], ${likes}::text[], ${prefixes}::text[]) AS q(term, pattern, prefix)
        WHERE p.is_active AND p.approval_status = 'approved'
          AND (p.name ILIKE q.pattern OR COALESCE(p.name_urdu, '') ILIKE q.pattern
               OR COALESCE(p.description, '') ILIKE q.pattern OR q.term <% p.name)
      ) x
      GROUP BY x.id
      ORDER BY BOOL_OR(x.exact) DESC, rel DESC, x.id
      LIMIT ${max}`;
  });
  const exact = rows.filter((r) => r.exact);
  return (exact.length >= FUZZY_WHEN_FEWER_THAN ? exact : rows).map((r) => r.id);
}

/** Dishes a customer can be shown at all (active, approved, from an active kitchen). */
async function visibleDishes(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.product.findMany({
    where: { id: { in: ids }, isActive: true, approvalStatus: 'approved', seller: { status: 'active' } },
    select: { id: true, sellerId: true, categoryId: true, trendScore: true },
  });
}

/** "Order again": what this customer ordered, often-and-recent first, that can still be ordered. */
export async function orderAgainProductIds(userId: string, limit = 12): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ product_id: string; created_at: Date }>>`
    SELECT oi.product_id, o.created_at
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = ${userId} AND oi.product_id IS NOT NULL AND ${COUNTED_ORDER}
      AND o.created_at >= now() - interval '365 days'`;
  const ranked = orderAgainScores(rows.map((r) => ({ productId: r.product_id, at: r.created_at })));
  const visible = new Set((await visibleDishes(ranked.map((r) => r.productId))).map((p) => p.id));
  return ranked.filter((r) => visible.has(r.productId)).slice(0, limit).map((r) => r.productId);
}

/** "Recommended for you" (see recommend() in utils/ranking.ts for how). */
export async function recommendedProducts(userId: string | null, limit = 12): Promise<Array<{ productId: string; reason: RecommendationReason }>> {
  const history = new Map<string, number>();
  const kitchenAffinity = new Map<string, number>();
  const categoryAffinity = new Map<string, number>();
  if (userId) {
    const mine = await prisma.$queryRaw<Array<{ product_id: string; seller_id: string; category_id: string | null; n: bigint }>>`
      SELECT oi.product_id, oi.seller_id, p.category_id, COUNT(*) AS n
      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
      WHERE o.customer_id = ${userId} AND ${COUNTED_ORDER} AND o.created_at >= now() - interval '180 days'
      GROUP BY oi.product_id, oi.seller_id, p.category_id`;
    for (const r of mine) {
      const n = Number(r.n);
      history.set(r.product_id, (history.get(r.product_id) ?? 0) + n);
      kitchenAffinity.set(r.seller_id, (kitchenAffinity.get(r.seller_id) ?? 0) + n);
      if (r.category_id) categoryAffinity.set(r.category_id, (categoryAffinity.get(r.category_id) ?? 0) + n);
    }
  }

  // Customers who ordered the same dishes, and everything they ordered (most overlapping 200).
  const neighbours = new Map<string, Set<string>>();
  if (history.size > 0) {
    const rows = await prisma.$queryRaw<Array<{ customer_id: string; product_id: string }>>`
      WITH neighbour AS (
        SELECT o.customer_id, COUNT(DISTINCT oi.product_id) AS overlap
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = ANY(${[...history.keys()]}::text[]) AND o.customer_id IS NOT NULL
          AND o.customer_id <> ${userId} AND ${COUNTED_ORDER} AND o.created_at >= now() - interval '180 days'
        GROUP BY o.customer_id ORDER BY overlap DESC LIMIT 200
      )
      SELECT DISTINCT o.customer_id, oi.product_id
      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN neighbour s ON s.customer_id = o.customer_id
      WHERE oi.product_id IS NOT NULL AND ${COUNTED_ORDER} AND o.created_at >= now() - interval '180 days'`;
    for (const r of rows) {
      const set = neighbours.get(r.customer_id) ?? new Set<string>();
      set.add(r.product_id);
      neighbours.set(r.customer_id, set);
    }
  }

  // Candidates: what neighbours ordered, more from the customer's kitchens and categories, and what's trending.
  const candidateIds = new Set<string>();
  for (const s of neighbours.values()) for (const id of s) candidateIds.add(id);
  const [fromKitchens, fromCategories, trending] = await Promise.all([
    kitchenAffinity.size
      ? prisma.product.findMany({ where: { sellerId: { in: [...kitchenAffinity.keys()] } }, select: { id: true }, orderBy: [{ trendScore: 'desc' }, { ratingScore: 'desc' }], take: 100 })
      : [],
    categoryAffinity.size
      ? prisma.product.findMany({ where: { categoryId: { in: [...categoryAffinity.keys()] } }, select: { id: true }, orderBy: [{ trendScore: 'desc' }, { ratingScore: 'desc' }], take: 100 })
      : [],
    prisma.product.findMany({ where: { trendScore: { gt: 0 } }, select: { id: true }, orderBy: { trendScore: 'desc' }, take: 50 }),
  ]);
  for (const p of [...fromKitchens, ...fromCategories, ...trending]) candidateIds.add(p.id);
  const candidates = new Map((await visibleDishes([...candidateIds])).map((p) => [p.id, { sellerId: p.sellerId, categoryId: p.categoryId, trendScore: p.trendScore }]));

  const dishCustomers = new Map<string, number>();
  if (candidates.size > 0) {
    const pop = await prisma.$queryRaw<Array<{ product_id: string; n: bigint }>>`
      SELECT oi.product_id, COUNT(DISTINCT o.customer_id) AS n
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ANY(${[...candidates.keys()]}::text[]) AND ${COUNTED_ORDER} AND o.created_at >= now() - interval '180 days'
      GROUP BY oi.product_id`;
    for (const r of pop) dishCustomers.set(r.product_id, Number(r.n));
  }

  return recommend({ history, neighbours, dishCustomers, candidates, kitchenAffinity, categoryAffinity }, limit).map(({ productId, reason }) => ({ productId, reason }));
}
