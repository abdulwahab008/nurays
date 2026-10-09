import { Queue, Worker, type Job } from 'bullmq';
import { redisUrl, newRedisConnection } from '../config/redis';

/**
 * Background jobs: work that shouldn't hold up a request and must be retried when it fails
 * (notification emails and SMS, push messages).
 *
 * With Redis they go through a durable BullMQ queue: a job survives a restart, failures are
 * retried with exponential backoff, and any instance can run it. Without Redis (development,
 * tests) a job runs in this process right after it is enqueued, with a few quick retries,
 * and is lost if the process stops.
 *
 *   defineJob('email.send', async (payload: { to: string }) => { ... });
 *   await enqueue('email.send', { to });
 */

const QUEUE_NAME = 'nuray-jobs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => Promise<void>;

const handlers = new Map<string, Handler>();
let queue: Queue | null = null;
let worker: Worker | null = null;
const localRuns = new Set<Promise<void>>();

export interface EnqueueOptions {
  /** Total tries before giving up (default 5 with Redis, 3 without). */
  attempts?: number;
  /** Run no sooner than this many milliseconds from now. */
  delayMs?: number;
  /** Deduplicate: a second job with the same id while the first exists is dropped. */
  jobId?: string;
}

export function defineJob<T>(name: string, handler: (payload: T) => Promise<void>) {
  handlers.set(name, handler as Handler);
}

let queueConnection: ReturnType<typeof newRedisConnection> | null = null;

function getQueue(): Queue | null {
  if (!redisUrl()) return null;
  if (!queue) {
    queueConnection = newRedisConnection('queue', { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  }
  return queue;
}

/** Is the queue's Redis connection usable right now? (ioredis reports 'ready' once connected.) */
function queueReady(): boolean {
  return queueConnection?.status === 'ready';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runLocally(name: string, payload: unknown, attempts: number, delayMs: number) {
  const handler = handlers.get(name)!;
  if (delayMs > 0) await sleep(delayMs);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await handler(payload);
      return;
    } catch (err) {
      const last = attempt === attempts;
      console.error(`Job ${name} failed (attempt ${attempt}/${attempts})${last ? ', giving up' : ''}: ${(err as Error)?.message ?? err}`);
      if (!last) await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
    }
  }
}

/** Queue a job. Never throws for a failing job; throws only for an unknown job name. */
export async function enqueue<T>(name: string, payload: T, opts: EnqueueOptions = {}): Promise<void> {
  if (!handlers.has(name)) throw new Error(`Unknown background job "${name}"`);
  const q = getQueue();
  // While Redis is unreachable the job runs here at once rather than holding the request
  // for the enqueue timeout on every call.
  if (q && queueReady()) {
    const added = q.add(name, payload, {
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: 15_000 },
      delay: opts.delayMs,
      jobId: opts.jobId,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
    try {
      // Redis can still drop mid-call: give add() a few seconds, then run the job here.
      await withTimeout(added, ENQUEUE_TIMEOUT_MS);
      return;
    } catch (err) {
      console.error(`Could not queue job ${name} (${(err as Error)?.message ?? err}); running it in this process.`);
      // If the add lands later all the same, withdraw it: the job is being run here.
      added.then((job) => job.remove().catch(() => undefined)).catch(() => undefined);
    }
  }
  const run = runLocally(name, payload, opts.attempts ?? 3, opts.delayMs ?? 0).finally(() => localRuns.delete(run));
  localRuns.add(run);
}

const ENQUEUE_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Start processing queued jobs in this process (no-op without Redis: jobs run inline). */
export function startWorkers(concurrency = 5) {
  if (!redisUrl() || worker) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler for background job "${job.name}"`);
      await handler(job.data);
    },
    { connection: newRedisConnection('queue-worker', { maxRetriesPerRequest: null }), concurrency }
  );
  worker.on('failed', (job, err) => {
    const attempts = job?.opts.attempts ?? 1;
    const final = (job?.attemptsMade ?? 0) >= attempts;
    console.error(`Job ${job?.name} (${job?.id}) failed (attempt ${job?.attemptsMade}/${attempts})${final ? ', giving up' : ''}: ${err.message}`);
  });
  worker.on('error', (err) => console.error('Job worker error:', err.message));
}

/** Finish running jobs and stop (graceful shutdown). */
export async function stopWorkers(): Promise<void> {
  await Promise.allSettled([worker?.close(), ...Array.from(localRuns)]);
  await queue?.close().catch(() => undefined);
  worker = null;
  queue = null;
}
