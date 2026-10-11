import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Redis is what lets several app instances act as one: shared rate-limit counters, live
 * updates that reach clients connected to any instance, and a durable background job queue.
 * Production requires REDIS_URL (config/env.ts). Without it (development, tests) each falls
 * back to this process alone: in-memory limits, local-only live updates, in-process jobs.
 */
export function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

let main: Redis | null = null;
const others: Redis[] = [];

function connect(name: string, options: RedisOptions): Redis {
  const client = new Redis(redisUrl()!, {
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    ...options,
  });
  // While Redis is down ioredis retries forever and emits an error per attempt: log each
  // distinct error once, and the recovery.
  let lastError = '';
  client.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error({ redis: name, err }, 'Redis error');
  });
  client.on('ready', () => {
    if (lastError) logger.info({ redis: name }, 'Redis reconnected');
    lastError = '';
  });
  return client;
}

// A command on the shared connection that gets no reply in this long fails. Only a closed or refused
// connection fails fast on its own: a Redis that stays connected but stops answering (frozen, or a
// network path that drops packets without resetting) would otherwise hold every caller for as long as it lasts.
const commandTimeoutMs = () => Number(process.env.REDIS_COMMAND_TIMEOUT_MS) || 2_000;

/**
 * The shared connection for quick commands (rate limits, health checks), or null when Redis
 * isn't configured. Commands fail at once while it is unreachable instead of queueing, and
 * after REDIS_COMMAND_TIMEOUT_MS when it is connected but silent, so an outage can't stall
 * requests: callers treat a failure as "Redis unavailable". (The queue's connections have no
 * such limit: a worker blocks on Redis for seconds on purpose.)
 */
export function getRedis(): Redis | null {
  if (!redisUrl()) return null;
  if (!main) main = connect('main', { enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: commandTimeoutMs() });
  return main;
}

/** A dedicated connection (pub/sub, queue workers), closed by closeRedis(). */
export function newRedisConnection(name: string, options: RedisOptions = {}): Redis {
  const client = connect(name, options);
  others.push(client);
  return client;
}

/** Close every connection (graceful shutdown). */
export async function closeRedis(): Promise<void> {
  const all = [main, ...others.splice(0)].filter((c): c is Redis => !!c);
  main = null;
  await Promise.allSettled(all.map((c) => c.quit()));
}
