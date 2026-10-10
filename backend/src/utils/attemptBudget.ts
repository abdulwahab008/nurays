import { getRedis } from '../config/redis';

/**
 * Counts of things that may only happen so many times in a window: wrong passwords on a "confirm
 * with your password" screen, address changes, verification e-mails to one address.
 *
 * The count lives in Redis when it is configured, so every app instance shares it; otherwise (and
 * whenever Redis cannot be reached) in this process's memory. An outage of Redis never blocks a
 * request, it only makes the count per instance for a while, the same as the rate limiters.
 *
 * Callers pass a key that already names what is counted, hashed where it holds a phone number or
 * an e-mail address, so the store never holds one.
 */

const PREFIX = 'budget:';

interface Entry {
  count: number;
  expiresAt: number;
}
const memory = new Map<string, Entry>();

function sweep(now: number) {
  if (memory.size < 5_000) return;
  for (const [key, entry] of memory) if (entry.expiresAt <= now) memory.delete(key);
}

function memoryUsed(key: string, now = Date.now()): number {
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) return 0;
  return entry.count;
}

/** How many times this key has been counted in the current window. */
export async function budgetUsed(key: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      return Number(await redis.get(PREFIX + key)) || 0;
    } catch {
      /* Redis unreachable: fall back to this process's count */
    }
  }
  return memoryUsed(key);
}

/** Count one more, starting a window of `windowMs` if there is none. Returns the new count. */
export async function budgetAdd(key: string, windowMs: number): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      // SET .. NX gives the key its lifetime before the first increment, so a counter can never outlive its window.
      const results = await redis.multi().set(PREFIX + key, 0, 'PX', windowMs, 'NX').incr(PREFIX + key).exec();
      const count = Number(results?.[1]?.[1]);
      if (Number.isFinite(count)) return count;
    } catch {
      /* Redis unreachable: fall back to this process's count */
    }
  }
  const now = Date.now();
  sweep(now);
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Forget the count (after a success). */
export async function budgetReset(key: string): Promise<void> {
  memory.delete(key);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(PREFIX + key);
  } catch {
    /* nothing to do: the window ends on its own */
  }
}
