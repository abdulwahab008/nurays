import { createHash } from 'crypto';
import { getRedis } from '../config/redis';

/**
 * Short-lived Redis cache for public catalogue reads that cost the database the most under load:
 * the ranked search's dish ids and the listing's product counts. Only values that are a function of
 * public data and of the key itself belong here, never anything that depends on who is asking.
 *
 * Every entry carries the catalogue version it was read under, and a product write that changes
 * what customers can find bumps the version, so the next read misses. Writes the version does not
 * track (kitchen-side changes such as a suspension or a new business name) show within the TTL.
 * Without Redis, or while it fails, every read goes to the database.
 */

export const CATALOG_CACHE_TTL_MS = 30_000;
const PREFIX = 'catalog:';
const VERSION_KEY = `${PREFIX}ver`;

interface Entry<T> {
  v: string;
  d: T;
}

/** A stable key for a value, e.g. a Prisma `where`. Instants are floored to the minute so "now" in a filter does not make every key unique. */
export function catalogKey(kind: string, value: unknown): string {
  const json = JSON.stringify(value, function (this: Record<string, unknown>, key: string, v: unknown) {
    const raw = this[key];
    if (raw instanceof Date) return `@${Math.floor(raw.getTime() / 60_000)}`;
    // Prisma.AnyNull and friends serialise as {}; Decimal would survive, but String() keeps them all distinct.
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.getPrototypeOf(raw) !== Object.prototype) return String(raw);
    return v;
  });
  return `${kind}:${createHash('sha256').update(json).digest('base64url')}`;
}

export async function cachedCatalogRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return load();
  let version: string;
  try {
    const [current, raw] = await redis.mget(VERSION_KEY, PREFIX + key);
    version = current ?? '0';
    if (raw) {
      const entry = JSON.parse(raw) as Entry<T>;
      if (entry.v === version) return entry.d;
    }
  } catch {
    return load();
  }
  // Tagged with the version read before loading: a product write that lands meanwhile bumps it, so
  // a value read from before that write is never served afterwards.
  const value = await load();
  const entry: Entry<T> = { v: version, d: value };
  redis.set(PREFIX + key, JSON.stringify(entry), 'PX', CATALOG_CACHE_TTL_MS).catch(() => undefined);
  return value;
}

/** Call after a product write commits that changes what the public catalogue lists or finds. */
export async function invalidateCatalogCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(VERSION_KEY);
  } catch {
    /* entries expire within CATALOG_CACHE_TTL_MS */
  }
}
