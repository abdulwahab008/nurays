/**
 * Ranking formulas: trustworthy ratings, trending that fades and resists gaming,
 * recommendations, and the order riders see jobs in.
 */
import { bayesianRating, decay, jobScore, orderAgainScores, recommend, trendScores, qualityFactor } from '../src/utils/ranking';

const now = new Date('2026-10-02T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

describe('rating you can trust', () => {
  it('one 5-star review does not beat two hundred 4.8s', () => {
    expect(bayesianRating(5, 1)).toBeLessThan(bayesianRating(4.8, 200));
  });
  it('no reviews sits at the prior, and many reviews approach the real average', () => {
    expect(bayesianRating(0, 0)).toBe(4);
    expect(bayesianRating(3, 1000)).toBeCloseTo(3, 1);
  });
});

describe('trending', () => {
  it('halves every three days', () => {
    expect(decay(0)).toBe(1);
    expect(decay(72)).toBeCloseTo(0.5);
    expect(decay(144)).toBeCloseTo(0.25);
  });

  it('a kitchen busy this week beats one that was busier two weeks ago', () => {
    const events = [
      ...['a', 'b', 'c'].map((c) => ({ key: 'now', customerId: c, at: hoursAgo(10) })),
      ...['a', 'b', 'c', 'd', 'e'].map((c) => ({ key: 'before', customerId: c, at: hoursAgo(12 * 24) })),
    ];
    const s = trendScores(events, now);
    expect(s.get('now')!.score).toBeGreaterThan(s.get('before')!.score);
  });

  it('orders older than two weeks do not count', () => {
    const s = trendScores([{ key: 'k', customerId: 'a', at: hoursAgo(15 * 24) }, { key: 'k', customerId: 'b', at: hoursAgo(15 * 24) }], now);
    expect(s.has('k')).toBe(false);
  });

  it('ten orders from one customer are not ten customers', () => {
    const spam = Array.from({ length: 10 }, () => ({ key: 'spam', customerId: 'x', at: hoursAgo(1) }));
    const real = ['a', 'b', 'c'].map((c) => ({ key: 'real', customerId: c, at: hoursAgo(1) }));
    const s = trendScores([...spam, { key: 'spam', customerId: 'y', at: hoursAgo(1) }, ...real], now);
    expect(s.get('spam')!.orders).toBe(11);
    expect(s.get('spam')!.score).toBeLessThan(s.get('real')!.score);
  });

  it('nothing trends on a single customer', () => {
    const s = trendScores(Array.from({ length: 5 }, () => ({ key: 'k', customerId: 'solo', at: hoursAgo(1) })), now);
    expect(s.get('k')!.score).toBe(0);
  });

  it('well-rated places get more of their demand counted', () => {
    expect(qualityFactor(5)).toBe(1);
    expect(qualityFactor(2)).toBe(0.5);
    expect(qualityFactor(4)).toBeGreaterThan(qualityFactor(3));
  });
});

describe('recommendations', () => {
  const candidates = new Map([
    ['biryani', { sellerId: 's1', categoryId: 'rice', trendScore: 0 }],
    ['raita', { sellerId: 's2', categoryId: 'sides', trendScore: 0 }],
    ['kheer', { sellerId: 's3', categoryId: 'sweets', trendScore: 0 }],
    ['pulao', { sellerId: 's4', categoryId: 'rice', trendScore: 0 }],
    ['nihari', { sellerId: 's1', categoryId: 'curry', trendScore: 0 }],
    ['burger', { sellerId: 's5', categoryId: 'fast', trendScore: 9 }],
  ]);
  const base = { dishCustomers: new Map(), candidates, kitchenAffinity: new Map(), categoryAffinity: new Map() };

  it('people who ordered what you ordered also ordered…', () => {
    const recs = recommend({
      ...base,
      history: new Map([['biryani', 2]]),
      neighbours: new Map([
        ['u1', new Set(['biryani', 'raita'])],
        ['u2', new Set(['biryani', 'raita', 'kheer'])],
        ['u3', new Set(['burger'])], // no overlap: no vote
      ]),
    });
    expect(recs[0]).toMatchObject({ productId: 'raita', reason: 'similar_customers' });
    expect(recs.map((r) => r.productId)).not.toContain('biryani'); // already ordered
  });

  it('more from kitchens and kinds of food you order', () => {
    const recs = recommend({
      ...base,
      history: new Map([['biryani', 3]]),
      neighbours: new Map(),
      kitchenAffinity: new Map([['s1', 3]]),
      categoryAffinity: new Map([['rice', 3]]),
    });
    const ids = recs.map((r) => r.productId);
    expect(recs.find((r) => r.productId === 'nihari')!.reason).toBe('kitchen_you_like');
    expect(recs.find((r) => r.productId === 'pulao')!.reason).toBe('category_you_like');
    expect(ids.indexOf('nihari')).toBeLessThan(ids.indexOf('burger'));
  });

  it('new customers get what is trending', () => {
    const recs = recommend({ ...base, history: new Map(), neighbours: new Map() });
    expect(recs).toEqual([{ productId: 'burger', score: expect.any(Number), reason: 'trending' }]);
  });

  it('order again: often and recent first', () => {
    const r = orderAgainScores(
      [
        { productId: 'old', at: hoursAgo(24 * 120) },
        { productId: 'old', at: hoursAgo(24 * 121) },
        { productId: 'recent', at: hoursAgo(24 * 2) },
      ],
      now
    );
    expect(r[0].productId).toBe('recent');
  });
});

describe('rider job order', () => {
  const job = { routeMatch: false, pickupDistanceKm: 1, waitingMinutes: 5, riderFee: 150, tripKm: 3, exceedsCashLimit: false };
  it('jobs on the way come first', () => {
    expect(jobScore({ ...job, routeMatch: true, pickupDistanceKm: 4 })).toBeGreaterThan(jobScore(job));
  });
  it('closer pickups beat far ones', () => {
    expect(jobScore({ ...job, pickupDistanceKm: 0.5 })).toBeGreaterThan(jobScore({ ...job, pickupDistanceKm: 5 }));
  });
  it('a job that has waited longer moves up', () => {
    expect(jobScore({ ...job, waitingMinutes: 30 })).toBeGreaterThan(jobScore({ ...job, waitingMinutes: 1 }));
  });
  it('cash jobs over the limit go to the bottom', () => {
    expect(jobScore({ ...job, exceedsCashLimit: true })).toBeLessThan(jobScore({ ...job, pickupDistanceKm: 20, waitingMinutes: 0 }));
  });
});
