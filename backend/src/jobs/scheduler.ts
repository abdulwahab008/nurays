import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { getRedis } from '../config/redis';
import { logger, requestContext } from '../utils/logger';

/**
 * In-process scheduled jobs that are safe with several app instances: each run takes a Redis
 * lease (SET NX PX, keyed by the job name), so only one instance does a given job at a time and
 * an overlapping run on the same instance is skipped. The lease costs no database connection
 * while the job runs (a Postgres transaction-scoped lock pinned one per job, and the pool
 * deadlocked once the jobs running together reached connection_limit). Without Redis
 * (development, tests; production requires it) only the in-process guard applies. If Redis is
 * configured but erroring, a run falls back to the old Postgres advisory lock rather than skipping
 * jobs that release stock and money.
 *
 * A run that has not settled after maxMs stops renewing its lease and gives back its slot (it cannot
 * be cancelled), so hung runs cannot park every other job; the job itself stays marked running.
 *
 * At most SCHEDULER_CONCURRENCY jobs (default 2) run at once per instance; the rest wait for a
 * slot before taking their lease. First runs are spread over a random delay, so jobs whose
 * intervals divide each other do not all start together on every boot and every day after.
 */

const LEASE_MS = 60_000;
const RENEW_MS = LEASE_MS / 3;
const FIRST_RUN_MS = 5_000;
const FIRST_RUN_JITTER_MS = 60_000;
const MAX_RUN_MS = 10 * 60 * 1000;

// Delete or extend the lease only while it is still ours (another instance may hold it after an expiry).
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";
const RENEW = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0";

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();
const degraded = new Set<string>();
const waiting: Array<() => void> = [];
let active = 0;

function maxConcurrent(): number {
  const n = Number(process.env.SCHEDULER_CONCURRENCY);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

async function takeSlot(): Promise<void> {
  if (active < maxConcurrent()) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function freeSlot() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

/**
 * Run fn while holding the job's lease; returns false if another holder has it. Rejects once fn has
 * run longer than maxMs, while fn keeps going in the background.
 */
export async function runExclusive(name: string, fn: () => Promise<void>, maxMs = MAX_RUN_MS): Promise<boolean> {
  if (running.has(name)) return false;
  running.add(name);
  await takeSlot();
  // The guard follows fn itself, not the lock: the Postgres fallback's transaction rejects at its
  // timeout while fn is still running.
  let body: Promise<void> | undefined;
  const run = withLock(name, () => (body = fn()), maxMs);
  const release = () => void running.delete(name);
  void run.then(release, () => (body ? body.then(release, release) : release()));
  let overrun: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    overrun = setTimeout(() => reject(new Error(`Job ${name} still running after ${maxMs}ms; slot freed, lease left to expire`)), maxMs);
    overrun.unref();
  });
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(overrun);
    freeSlot();
  }
}

async function withLock(name: string, fn: () => Promise<void>, maxMs: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    await fn();
    return true;
  }
  const key = `lock:job:${name}`;
  const token = randomUUID();
  let taken: string | null;
  try {
    taken = await redis.set(key, token, 'PX', LEASE_MS, 'NX');
  } catch (err) {
    if (!degraded.has(name)) {
      degraded.add(name);
      logger.warn({ err, job: name }, 'Job lease unavailable (Redis error); falling back to a Postgres advisory lock');
    }
    return withAdvisoryLock(name, fn, maxMs);
  }
  if (degraded.delete(name)) logger.info({ job: name }, 'Job lease available again');
  if (taken !== 'OK') return false;
  const stopRenewingAt = Date.now() + maxMs;
  const renew = setInterval(() => {
    if (Date.now() >= stopRenewingAt) return clearInterval(renew);
    redis.eval(RENEW, 1, key, token, LEASE_MS).catch((err) => logger.warn({ err, job: name }, 'Job lease renewal failed'));
  }, RENEW_MS);
  renew.unref();
  try {
    await fn();
    return true;
  } finally {
    clearInterval(renew);
    await redis.eval(RELEASE, 1, key, token).catch((err) => logger.warn({ err, job: name }, 'Job lease release failed'));
  }
}

// Pins one pooled connection per running job for the whole run (what deadlocked the pool before the
// Redis lease); accepted only while Redis is down, since skipping the jobs is worse.
async function withAdvisoryLock(name: string, fn: () => Promise<void>, maxMs: number): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const rows: Array<{ locked: boolean }> = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${'job:' + name})) AS locked`;
      if (!rows[0]?.locked) return false;
      await fn();
      return true;
    },
    { timeout: maxMs, maxWait: 10_000 }
  );
}

export function scheduleJob(name: string, everyMs: number, fn: () => Promise<unknown>, opts: { runAtStart?: boolean } = {}) {
  // Each run gets its own id in the request-id field, so every line it logs can be found together.
  const tick = () =>
    requestContext.run({ requestId: `sched:${name}:${randomUUID()}` }, async () => {
      const started = Date.now();
      try {
        const ran = await runExclusive(name, async () => {
          await fn();
        });
        logger.debug({ job: name, ran, durationMs: Date.now() - started }, `Job ${name} finished`);
      } catch (err) {
        logger.error({ err, job: name, durationMs: Date.now() - started }, `Job ${name} failed`);
      }
    });
  const start = setTimeout(() => {
    if (opts.runAtStart !== false) void tick();
    const timer = setInterval(tick, everyMs);
    timer.unref();
    timers.push(timer);
  }, FIRST_RUN_MS + Math.random() * FIRST_RUN_JITTER_MS);
  start.unref();
  timers.push(start);
}

/** Stop scheduling (graceful shutdown). */
export function stopScheduler() {
  for (const t of timers.splice(0)) clearInterval(t);
}
