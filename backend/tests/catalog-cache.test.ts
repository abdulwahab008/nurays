/**
 * The ranked search and the listing's product counts were the slowest statements at 5,000 users. Both are public
 * data, so they are cached in Redis for a few seconds, tagged with a catalogue version that product writes bump.
 * Redis here is an in-memory double; the database is a double that counts queries.
 */

const fakeRedis = {
  store: new Map<string, { value: string; expiresAt: number }>(),
  failing: false,
  now: 0,
  read(key: string): string | null {
    const e = fakeRedis.store.get(key);
    return e && e.expiresAt > fakeRedis.now ? e.value : null;
  },
  mget: async (...keys: string[]) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    return keys.map((k) => fakeRedis.read(k));
  },
  set: async (key: string, value: string, _px: 'PX', ms: number) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    fakeRedis.store.set(key, { value, expiresAt: fakeRedis.now + ms });
    return 'OK';
  },
  incr: async (key: string) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    const next = Number(fakeRedis.read(key) ?? 0) + 1;
    fakeRedis.store.set(key, { value: String(next), expiresAt: Infinity });
    return next;
  },
};
let redisOn = true;
jest.mock('../src/config/redis', () => ({ getRedis: () => (redisOn ? fakeRedis : null) }));

const queryRaw = jest.fn(async (): Promise<Array<{ id: string; rel: number; exact: boolean }>> => [{ id: 'dish-1', rel: 3, exact: true }]);
const tx = { $executeRaw: jest.fn(), $queryRaw: queryRaw };
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
}));

import { Prisma } from '@prisma/client';
import { CATALOG_CACHE_TTL_MS, cachedCatalogRead, catalogKey, invalidateCatalogCache } from '../src/utils/catalogCache';
import { searchRankedProductIds } from '../src/services/ranking.service';

beforeEach(() => {
  fakeRedis.store.clear();
  fakeRedis.failing = false;
  fakeRedis.now = 0;
  redisOn = true;
});

describe('cachedCatalogRead', () => {
  it('loads on a miss and serves the stored value until the TTL ends', async () => {
    const load = jest.fn(async () => 42);
    expect(await cachedCatalogRead('k', load)).toBe(42);
    await new Promise((r) => setImmediate(r));
    expect(await cachedCatalogRead('k', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);

    fakeRedis.now += CATALOG_CACHE_TTL_MS;
    expect(await cachedCatalogRead('k', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('misses after a product write bumps the catalogue version', async () => {
    let n = 1;
    const load = jest.fn(async () => n);
    await cachedCatalogRead('k', load);
    await new Promise((r) => setImmediate(r));
    n = 2;
    await invalidateCatalogCache();
    expect(await cachedCatalogRead('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never serves a value loaded from before a write that landed while it was loading', async () => {
    const load = jest.fn(async () => {
      await invalidateCatalogCache();
      return 'old';
    });
    await cachedCatalogRead('k', load);
    await new Promise((r) => setImmediate(r));
    const fresh = jest.fn(async () => 'new');
    expect(await cachedCatalogRead('k', fresh)).toBe('new');
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('reads the database every time when Redis fails or is not configured', async () => {
    const load = jest.fn(async () => 7);
    fakeRedis.failing = true;
    expect(await cachedCatalogRead('k', load)).toBe(7);
    expect(await cachedCatalogRead('k', load)).toBe(7);
    await expect(invalidateCatalogCache()).resolves.toBeUndefined();
    redisOn = false;
    expect(await cachedCatalogRead('k', load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe('catalogKey', () => {
  it('is the same for the same filter, and differs when any part of it differs', () => {
    const where = { isActive: true, seller: { status: 'active' }, id: { in: ['a', 'b'] } };
    expect(catalogKey('count', where)).toBe(catalogKey('count', { isActive: true, seller: { status: 'active' }, id: { in: ['a', 'b'] } }));
    expect(catalogKey('count', where)).not.toBe(catalogKey('count', { ...where, id: { in: ['a', 'c'] } }));
    expect(catalogKey('count', where)).not.toBe(catalogKey('search', where));
  });

  it('floors instants to the minute so a "now" in the filter still shares a key', () => {
    const at = (iso: string) => catalogKey('count', { validUntil: { gte: new Date(iso) } });
    expect(at('2026-11-08T10:00:05Z')).toBe(at('2026-11-08T10:00:55Z'));
    expect(at('2026-11-08T10:00:55Z')).not.toBe(at('2026-11-08T10:01:05Z'));
  });

  it('keeps Prisma null markers apart from an empty object', () => {
    expect(catalogKey('count', { f: { not: Prisma.AnyNull } })).not.toBe(catalogKey('count', { f: { not: {} } }));
  });
});

describe('searchRankedProductIds', () => {
  it('serves a repeated search from the cache, per normalised terms, until a product write', async () => {
    expect(await searchRankedProductIds(['Biryani'])).toEqual(['dish-1']);
    await new Promise((r) => setImmediate(r));
    expect(await searchRankedProductIds([' biryani '])).toEqual(['dish-1']);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    await searchRankedProductIds(['nihari']);
    expect(queryRaw).toHaveBeenCalledTimes(2);

    await invalidateCatalogCache();
    await searchRankedProductIds(['biryani']);
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('still searches when Redis is down', async () => {
    fakeRedis.failing = true;
    expect(await searchRankedProductIds(['biryani'])).toEqual(['dish-1']);
    expect(await searchRankedProductIds(['biryani'])).toEqual(['dish-1']);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
