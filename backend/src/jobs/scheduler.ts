import prisma from '../config/database';
import { logger } from '../utils/logger';

/**
 * In-process scheduled jobs that are safe with several app instances: each run takes
 * a Postgres advisory lock (keyed by the job name), so only one instance does a given
 * job at a time and an overlapping run on the same instance is skipped.
 */

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();

/** Run fn while holding a transaction-scoped advisory lock; returns false if another holder has it. */
export async function runExclusive(name: string, fn: () => Promise<void>, maxMs = 10 * 60 * 1000): Promise<boolean> {
  if (running.has(name)) return false;
  running.add(name);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const rows: Array<{ locked: boolean }> = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${'job:' + name})) AS locked`;
        if (!rows[0]?.locked) return false;
        await fn();
        return true;
      },
      { timeout: maxMs, maxWait: 10_000 }
    );
  } finally {
    running.delete(name);
  }
}

export function scheduleJob(name: string, everyMs: number, fn: () => Promise<unknown>, opts: { runAtStart?: boolean } = {}) {
  const tick = () =>
    runExclusive(name, async () => {
      await fn();
    }).catch((err) => logger.error({ err, job: name }, `Job ${name} failed`));
  if (opts.runAtStart !== false) setTimeout(tick, 5_000).unref?.();
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  timers.push(timer);
}

/** Stop scheduling (graceful shutdown). */
export function stopScheduler() {
  for (const t of timers.splice(0)) clearInterval(t);
}
