import otpService from '../services/otp.service';
import orderService from '../services/order.service';
import { nudgeUnacceptedOrders, nudgeLateOrders, autoCompleteDeliveredOrders } from './order-nudges';

/**
 * Lightweight in-process job scheduler.
 *
 * Deliberately not Bull/Redis: the app already runs a single Node process and
 * these jobs are idempotent and cheap. If the platform scales to multiple
 * instances, move these to a Redis-backed queue so they don't run N times.
 */

type Job = {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * 60 * 1000;

const jobs: Job[] = [
  {
    name: 'cleanup-expired-otps',
    everyMs: HOUR,
    run: () => otpService.cleanupExpiredOTPs(),
  },
  {
    name: 'auto-cancel-stale-pending-orders',
    everyMs: HOUR,
    run: () => orderService.autoCancelStalePendingOrders(24),
  },
  {
    name: 'nudge-unaccepted-orders',
    everyMs: 5 * MINUTE,
    run: () => nudgeUnacceptedOrders(10),
  },
  {
    name: 'nudge-late-orders',
    everyMs: 10 * MINUTE,
    run: () => nudgeLateOrders(),
  },
  {
    name: 'auto-complete-delivered-orders',
    everyMs: HOUR,
    run: () => autoCompleteDeliveredOrders(24),
  },
];

const timers: NodeJS.Timeout[] = [];

async function runJob(job: Job): Promise<void> {
  try {
    const result = await job.run();
    if (typeof result === 'number' && result > 0) {
      console.log(`[scheduler] ${job.name}: ${result} affected`);
    }
  } catch (err) {
    console.error(`[scheduler] ${job.name} failed:`, err instanceof Error ? err.message : err);
  }
}

export function startScheduler(): void {
  if (process.env.NODE_ENV === 'test') return;
  for (const job of jobs) {
    // Stagger the first run a little so startup isn't a thundering herd.
    setTimeout(() => void runJob(job), 30 * 1000);
    timers.push(setInterval(() => void runJob(job), job.everyMs));
  }
  console.log(`⏰ Scheduler started (${jobs.length} jobs)`);
}

export function stopScheduler(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
}
