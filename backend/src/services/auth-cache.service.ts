import prisma from '../config/database';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * What every signed-in request checks (the account's standing, and whether its session is still signed in), kept in
 * Redis for up to TTL_SECONDS so most requests skip the database.
 *
 * Whatever changes one of those facts calls forgetAuthUsers / forgetSessions once its write has committed. Forgetting
 * writes a marker instead of deleting the key, and the cache is only ever filled with SET NX: a request that read the
 * database just before the change cannot put the old answer back over the marker. If a forget cannot reach Redis, the
 * old answer still ends with its TTL. Without Redis, or while it fails, every check reads the database.
 */
const TTL_SECONDS = 30;
const USER = 'auth:user:';
const SESSION = 'auth:sid:';
const FORGOTTEN = '-';
// After a failure, reads skip Redis for a while: a Redis that stopped answering would otherwise add its command timeout to every request.
const PAUSE_MS = 5_000;
const WARN_EVERY_MS = 60_000;

let pausedUntil = 0;
let lastWarnAt = 0;

function unavailable(err: unknown) {
  const now = Date.now();
  pausedUntil = now + PAUSE_MS;
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  logger.warn({ err }, 'Auth cache unavailable: sign-ins are checked against the database');
}

/** The cached value, null when there is none, undefined when the cache can't be used. */
async function read(key: string): Promise<string | null | undefined> {
  const redis = getRedis();
  if (!redis || Date.now() < pausedUntil) return undefined;
  try {
    return await redis.get(key);
  } catch (err) {
    unavailable(err);
    return undefined;
  }
}

async function fill(key: string, value: string): Promise<void> {
  try {
    await getRedis()?.set(key, value, 'EX', TTL_SECONDS, 'NX');
  } catch (err) {
    unavailable(err);
  }
}

async function overwrite(keys: string[], value: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !keys.length) return;
  try {
    await Promise.all(keys.map((key) => redis.set(key, value, 'EX', TTL_SECONDS)));
  } catch (err) {
    unavailable(err);
  }
}

export interface AuthUser {
  id: string;
  status: string;
  userType: string;
  staffRole: string | null;
  tokensValidAfter: Date | null;
}

interface CachedUser {
  s: string;
  t: string;
  r: string | null;
  v: number | null;
}

/** The account fields a signed-in request is checked against, or null when there is no such account. */
export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const key = USER + userId;
  const hit = await read(key);
  if (hit && hit !== FORGOTTEN) {
    const c = JSON.parse(hit) as CachedUser;
    return { id: userId, status: c.s, userType: c.t, staffRole: c.r, tokensValidAfter: c.v === null ? null : new Date(c.v) };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, userType: true, staffRole: true, tokensValidAfter: true },
  });
  if (user && hit === null) {
    const c: CachedUser = { s: user.status, t: user.userType, r: user.staffRole, v: user.tokensValidAfter?.getTime() ?? null };
    await fill(key, JSON.stringify(c));
  }
  return user;
}

/** Whether a session is signed in, cached. An ended session never comes back, so "no" is cached as well as "yes". */
export async function cachedSessionActive(sid: string, load: () => Promise<boolean>): Promise<boolean> {
  const key = SESSION + sid;
  const hit = await read(key);
  if (hit === '1') return true;
  if (hit === '0') return false;
  const active = await load();
  if (hit === null) await fill(key, active ? '1' : '0');
  return active;
}

/** Call after a change to an account's status, userType, staffRole or tokensValidAfter has committed. */
export function forgetAuthUsers(...userIds: string[]): Promise<void> {
  return overwrite(userIds.map((id) => USER + id), FORGOTTEN);
}

/** Call after sessions were ended: they answer "signed out" at once. */
export function forgetSessions(sids: string[]): Promise<void> {
  return overwrite([...new Set(sids)].map((sid) => SESSION + sid), '0');
}
