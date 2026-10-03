/**
 * Ranking formulas: pure functions, no database, so they can be tested and tuned on their own.
 * ranking.service.ts feeds them real data and stores the results.
 */

// ---------------------------------------------------------------------------------------------
// Rating you can trust: a Bayesian average.
//
// A dish with one 5-star review shouldn't outrank one with 200 reviews averaging 4.8. Every
// item starts as if it already had `weight` reviews at `mean`; real reviews pull it away
// from there, and with enough of them the prior stops mattering.
// ---------------------------------------------------------------------------------------------
export const RATING_PRIOR = { mean: 4.0, weight: 5 };

export function bayesianRating(average: number, count: number, prior = RATING_PRIOR): number {
  if (!(count > 0) || !Number.isFinite(average)) return prior.mean;
  return (prior.weight * prior.mean + average * count) / (prior.weight + count);
}

// ---------------------------------------------------------------------------------------------
// Trending: recent demand, with old orders fading out.
//
// Each order counts 1 when it's placed and half as much every `halfLifeHours` after that,
// over the last `windowDays`. A kitchen busy this week beats one that was busy a month ago,
// and a new kitchen can trend as soon as people order from it.
//
// Hard to game:
//  - one customer's orders count 1, then 0.5, then 0.25, then nothing more (so ten orders
//    from one phone are worth 1.75, not 10);
//  - nothing trends on fewer than `minCustomers` different customers;
//  - the service leaves out cancelled, unpaid-online and a kitchen's own orders.
// ---------------------------------------------------------------------------------------------
export const TREND = {
  windowDays: 14,
  halfLifeHours: 72,
  perCustomerWeights: [1, 0.5, 0.25],
  minCustomers: 2,
};

export function decay(ageHours: number, halfLifeHours = TREND.halfLifeHours): number {
  return Math.pow(0.5, Math.max(0, ageHours) / halfLifeHours);
}

export interface DemandEvent {
  /** What is being scored: a kitchen id or a dish id. */
  key: string;
  /** Who ordered (null when the account is gone: then each order counts as its own customer). */
  customerId: string | null;
  at: Date;
}

export interface TrendResult {
  score: number;
  customers: number;
  orders: number;
}

export function trendScores(events: DemandEvent[], now = new Date(), opts = TREND): Map<string, TrendResult> {
  const windowStart = now.getTime() - opts.windowDays * 24 * 3600 * 1000;
  // key -> customer -> decayed weights of that customer's orders
  const byKey = new Map<string, Map<string, number[]>>();
  let anon = 0;
  for (const e of events) {
    const t = e.at.getTime();
    if (t < windowStart || t > now.getTime() + 60_000) continue;
    const customer = e.customerId ?? `anon:${anon++}`;
    let customers = byKey.get(e.key);
    if (!customers) byKey.set(e.key, (customers = new Map()));
    const list = customers.get(customer) ?? [];
    list.push(decay((now.getTime() - t) / 3_600_000, opts.halfLifeHours));
    customers.set(customer, list);
  }

  const out = new Map<string, TrendResult>();
  for (const [key, customers] of byKey) {
    let score = 0;
    let orders = 0;
    for (const weights of customers.values()) {
      orders += weights.length;
      // A customer's most recent orders count first, at full, half and quarter weight.
      weights.sort((a, b) => b - a);
      weights.forEach((w, i) => (score += w * (opts.perCustomerWeights[i] ?? 0)));
    }
    out.set(key, { score: customers.size >= opts.minCustomers ? score : 0, customers: customers.size, orders });
  }
  return out;
}

/** Well-rated places trend a little more readily than poorly rated ones (×0.5 at 2.5★ up to ×1 at 5★). */
export function qualityFactor(ratingScore: number): number {
  return 0.5 + 0.5 * Math.min(Math.max((ratingScore - 2.5) / 2.5, 0), 1);
}

// ---------------------------------------------------------------------------------------------
// "Recommended for you": people who ordered what you ordered also ordered…
//
// Item-to-item collaborative filtering, the approach behind Amazon's recommendations, plus
// two simpler signals and a cold-start fallback:
//  - similar customers: each other customer who shares dishes with you votes for what else
//    they ordered, weighted by how much you overlap (overlap / √(their dish count)); a dish's
//    votes are divided by √(its customer count) so a dish everyone orders doesn't win by default;
//  - kitchens you order from: their other dishes;
//  - kinds of food you order: other dishes in the same categories;
//  - what's trending, for new customers and to fill the list.
// Dishes you've already ordered are left out (they're under "Order again").
// ---------------------------------------------------------------------------------------------
export type RecommendationReason = 'similar_customers' | 'kitchen_you_like' | 'category_you_like' | 'trending';

export interface RecommendationInput {
  /** Dishes this customer ordered: id -> times. */
  history: Map<string, number>;
  /** Other customers' orders of dishes overlapping this customer's: customer -> their dish set. */
  neighbours: Map<string, Set<string>>;
  /** Distinct customers per dish (popularity), for the dishes being voted on. */
  dishCustomers: Map<string, number>;
  /** Dishes that may be shown, with what's needed to score them. */
  candidates: Map<string, { sellerId: string; categoryId: string | null; trendScore: number }>;
  /** Kitchens this customer ordered from: id -> times. */
  kitchenAffinity: Map<string, number>;
  /** Categories this customer ordered from: id -> times. */
  categoryAffinity: Map<string, number>;
}

export const RECOMMEND_WEIGHTS = { similar: 3, kitchen: 1, category: 0.5, trend: 0.3 };

export function recommend(input: RecommendationInput, limit = 12): Array<{ productId: string; score: number; reason: RecommendationReason }> {
  const parts = new Map<string, Record<RecommendationReason, number>>();
  const add = (id: string, reason: RecommendationReason, v: number) => {
    if (!input.candidates.has(id) || input.history.has(id) || !(v > 0)) return;
    const p = parts.get(id) ?? { similar_customers: 0, kitchen_you_like: 0, category_you_like: 0, trending: 0 };
    p[reason] += v;
    parts.set(id, p);
  };

  // Similar customers.
  const mine = new Set(input.history.keys());
  for (const dishes of input.neighbours.values()) {
    let overlap = 0;
    for (const d of dishes) if (mine.has(d)) overlap++;
    if (overlap === 0) continue;
    const w = overlap / Math.sqrt(dishes.size);
    for (const d of dishes) {
      if (mine.has(d)) continue;
      add(d, 'similar_customers', (RECOMMEND_WEIGHTS.similar * w) / Math.sqrt(Math.max(1, input.dishCustomers.get(d) ?? 1)));
    }
  }

  const kitchenTotal = [...input.kitchenAffinity.values()].reduce((a, b) => a + b, 0) || 1;
  const categoryTotal = [...input.categoryAffinity.values()].reduce((a, b) => a + b, 0) || 1;
  const maxTrend = Math.max(0, ...[...input.candidates.values()].map((c) => c.trendScore)) || 1;
  for (const [id, c] of input.candidates) {
    add(id, 'kitchen_you_like', RECOMMEND_WEIGHTS.kitchen * ((input.kitchenAffinity.get(c.sellerId) ?? 0) / kitchenTotal));
    if (c.categoryId) add(id, 'category_you_like', RECOMMEND_WEIGHTS.category * ((input.categoryAffinity.get(c.categoryId) ?? 0) / categoryTotal));
    add(id, 'trending', RECOMMEND_WEIGHTS.trend * (c.trendScore / maxTrend));
  }

  return [...parts.entries()]
    .map(([productId, p]) => {
      const score = p.similar_customers + p.kitchen_you_like + p.category_you_like + p.trending;
      // The reason shown is the signal that contributed most.
      const reason = (Object.entries(p) as Array<[RecommendationReason, number]>).sort((a, b) => b[1] - a[1])[0][0];
      return { productId, score, reason };
    })
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId))
    .slice(0, limit);
}

/** "Order again": dishes ordered often and recently first (each order fades with a 30-day half-life). */
export function orderAgainScores(orders: Array<{ productId: string; at: Date }>, now = new Date()): Array<{ productId: string; score: number }> {
  const scores = new Map<string, number>();
  for (const o of orders) scores.set(o.productId, (scores.get(o.productId) ?? 0) + decay((now.getTime() - o.at.getTime()) / 3_600_000, 30 * 24));
  return [...scores.entries()].map(([productId, score]) => ({ productId, score })).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------------------------
// Which delivery jobs a rider sees first.
//
// Jobs on the way of the one they're already carrying come first (they pay a bonus). Then
// closer pickups (less riding unpaid), jobs that have waited longer (the food is getting cold
// and the customer is waiting), and better pay per kilometre. Cash jobs the rider can't take
// because of their cash limit go to the bottom.
// ---------------------------------------------------------------------------------------------
export interface JobFacts {
  routeMatch: boolean;
  /** Rider to pickup, when both positions are known. */
  pickupDistanceKm: number | null;
  waitingMinutes: number;
  riderFee: number;
  /** Pickup to customer. */
  tripKm: number | null;
  exceedsCashLimit: boolean;
}

export const JOB_WEIGHTS = { routeMatch: 100, perPickupKm: 8, unknownPickupKm: 3, perWaitingMinute: 0.6, maxWaitingMinutes: 45, perRupeePerKm: 0.5 };

export function jobScore(j: JobFacts): number {
  if (j.exceedsCashLimit) return -1000 + j.waitingMinutes * 0.01;
  const pickupKm = j.pickupDistanceKm ?? JOB_WEIGHTS.unknownPickupKm;
  const km = Math.max(1, pickupKm + (j.tripKm ?? 0));
  return (
    (j.routeMatch ? JOB_WEIGHTS.routeMatch : 0) -
    pickupKm * JOB_WEIGHTS.perPickupKm +
    Math.min(Math.max(j.waitingMinutes, 0), JOB_WEIGHTS.maxWaitingMinutes) * JOB_WEIGHTS.perWaitingMinute +
    (j.riderFee / km) * JOB_WEIGHTS.perRupeePerKm
  );
}
