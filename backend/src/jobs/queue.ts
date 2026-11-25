import { Queue, Worker, type Job } from 'bullmq';
import { redisUrl, newRedisConnection } from '../config/redis';
import { logger, requestContext } from '../utils/logger';

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

/**
 * Lanes: one durable queue each, with its own workers, so a slow outside service only holds up its own lane.
 * Email waits on a mail server (up to 20 s on a bad day) and SMS on its provider; push and everything else
 * are quick and must not queue behind them. In a burst of orders the jobs used to share five slots, and a
 * slow mail server delayed every kitchen's push alert by minutes.
 */
export type Lane = 'default' | 'email' | 'sms';
const LANES: Record<Lane, { queue: string; concurrency: number }> = {
  default: { queue: 'nuray-jobs', concurrency: 20 },
  email: { queue: 'nuray-jobs-email', concurrency: 10 },
  sms: { queue: 'nuray-jobs-sms', concurrency: 10 },
};
const LANE_NAMES = Object.keys(LANES) as Lane[];

// The id of the request that queued a job travels in its data, so the worker's log lines carry it too.
const REQUEST_ID_KEY = '_requestId';

function withRequestId<T>(payload: T): T | (T & { [REQUEST_ID_KEY]: string }) {
  const requestId = requestContext.getStore()?.requestId;
  if (!requestId || payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return { ...payload, [REQUEST_ID_KEY]: requestId };
}

/** Split a queued job's data into the handler's payload and the request id it was queued under. */
export function unpackJobData(job: { name: string; id?: string; data: unknown }): { payload: unknown; requestId: string } {
  const fallback = `job:${job.name}:${job.id ?? 'local'}`;
  if (job.data === null || typeof job.data !== 'object' || Array.isArray(job.data)) return { payload: job.data, requestId: fallback };
  const { [REQUEST_ID_KEY]: requestId, ...payload } = job.data as Record<string, unknown>;
  return { payload, requestId: typeof requestId === 'string' ? requestId : fallback };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => Promise<void>;

const handlers = new Map<string, Handler>();
const queues = new Map<Lane, Queue>();
const workers: Worker[] = [];
const localRuns = new Set<Promise<void>>();

export interface EnqueueOptions {
  /** Total tries before giving up (default 5 with Redis, 3 without). */
  attempts?: number;
  /** Run no sooner than this many milliseconds from now. */
  delayMs?: number;
  /** Deduplicate: a second job with the same id while the first exists is dropped. */
  jobId?: string;
  /** The lane the job waits in (default 'default'): 'email' and 'sms' for jobs that call those providers. */
  lane?: Lane;
}

export function defineJob<T>(name: string, handler: (payload: T) => Promise<void>) {
  handlers.set(name, handler as Handler);
}

let queueConnection: ReturnType<typeof newRedisConnection> | null = null;
// Set while the queue's connection is opening for the first time.
let connecting: Promise<void> | null = null;

const CONNECT_WAIT_MS = 2_000;

/**
 * Resolves when the connection first becomes ready, fails or closes, or after CONNECT_WAIT_MS. A job that
 * arrives while the connection is still opening waits for it, so a start is not taken for an outage and
 * the job run in this process, without the durability of the queue.
 */
function firstReady(connection: NonNullable<typeof queueConnection>): Promise<void> {
  return new Promise<void>((resolve) => {
    const events = ['ready', 'error', 'close'] as const;
    const done = () => {
      clearTimeout(timer);
      for (const event of events) connection.off(event, done);
      resolve();
    };
    const timer = setTimeout(done, CONNECT_WAIT_MS);
    timer.unref?.();
    for (const event of events) connection.on(event, done);
  });
}

function getQueue(lane: Lane = 'default'): Queue | null {
  if (!redisUrl()) return null;
  if (!queueConnection) {
    queueConnection = newRedisConnection('queue', { maxRetriesPerRequest: null });
    const opening = firstReady(queueConnection);
    connecting = opening;
    void opening.then(() => {
      if (connecting === opening) connecting = null;
    });
  }
  let queue = queues.get(lane);
  if (!queue) {
    queue = new Queue(LANES[lane].queue, { connection: queueConnection });
    queues.set(lane, queue);
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
      logger.error({ err, job: name, attempt, attempts, final: last }, last ? 'Job failed; giving up' : 'Job failed; will retry');
      if (!last) await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
    }
  }
}

/** Queue a job. Never throws for a failing job; throws only for an unknown job name. */
export async function enqueue<T>(name: string, payload: T, opts: EnqueueOptions = {}): Promise<void> {
  if (!handlers.has(name)) throw new Error(`Unknown background job "${name}"`);
  const q = getQueue(opts.lane);
  if (connecting) await connecting;
  // While Redis is unreachable the job runs here at once rather than holding the request
  // for the enqueue timeout on every call.
  if (q && queueReady()) {
    const added = q.add(name, withRequestId(payload), {
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
      logger.error({ err, job: name }, 'Could not queue the job; running it in this process');
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

export interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

/** Job counts of the durable queue, every lane together; null without Redis or while it is unreachable (jobs then run in this process). */
export async function getQueueCounts(): Promise<QueueCounts | null> {
  const lanes = LANE_NAMES.map((lane) => getQueue(lane));
  if (connecting) await connecting;
  if (lanes.some((q) => !q) || !queueReady()) return null;
  try {
    const all = await withTimeout(Promise.all(lanes.map((q) => q!.getJobCounts('waiting', 'active', 'failed', 'delayed'))), ENQUEUE_TIMEOUT_MS);
    const sum = (key: keyof QueueCounts) => all.reduce((total, counts) => total + (counts[key] ?? 0), 0);
    return { waiting: sum('waiting'), active: sum('active'), failed: sum('failed'), delayed: sum('delayed') };
  } catch (err) {
    logger.warn({ err }, 'Could not read the job queue counts');
    return null;
  }
}

async function runJob(job: Job) {
  const handler = handlers.get(job.name);
  if (!handler) throw new Error(`No handler for background job "${job.name}"`);
  const { payload, requestId } = unpackJobData(job);
  await requestContext.run({ requestId }, () => handler(payload));
}

/** Start processing queued jobs in this process, one worker per lane (no-op without Redis: jobs run inline). */
export function startWorkers() {
  if (!redisUrl() || workers.length > 0) return;
  getQueue(); // the queue's own connection opens now too, so the first job finds it ready
  for (const lane of LANE_NAMES) {
    const { queue, concurrency } = LANES[lane];
    const worker = new Worker(queue, runJob, {
      connection: newRedisConnection(lane === 'default' ? 'queue-worker' : `queue-worker-${lane}`, { maxRetriesPerRequest: null }),
      concurrency,
    });
    worker.on('failed', (job, err) => {
      const attempts = job?.opts.attempts ?? 1;
      const final = (job?.attemptsMade ?? 0) >= attempts;
      const requestId = job ? unpackJobData(job).requestId : undefined;
      logger.error({ err, requestId, lane, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, attempts, final }, final ? 'Job failed; giving up' : 'Job failed; will retry');
    });
    worker.on('error', (err) => logger.error({ err, lane }, 'Job worker error'));
    workers.push(worker);
  }
}

/** Finish running jobs and stop (graceful shutdown). */
export async function stopWorkers(): Promise<void> {
  await Promise.allSettled([...workers.map((w) => w.close()), ...Array.from(localRuns)]);
  await Promise.allSettled(Array.from(queues.values()).map((q) => q.close()));
  workers.length = 0;
  queues.clear();
}

export interface LaneHealth {
  lane: Lane;
  waiting: number;
  active: number;
  /** Waiting to retry after a failure. */
  delayed: number;
  /** Gave up after every attempt (the last 5000 are kept). */
  failed: number;
  /** Processes taking this lane's jobs right now; 0 means its jobs only pile up. */
  workers: number;
}

export interface JobProblem {
  lane: Lane;
  name: string;
  id: string | null;
  reason: string;
  attempts: number;
  at: string | null;
}

/**
 * Each lane's counts and connected workers, the latest jobs that gave up, and the latest ones waiting to retry (for
 * the admin System health page). Null without Redis or while it is unreachable: jobs then run in this process.
 */
export async function getLaneHealth(limit = 10): Promise<{ lanes: LaneHealth[]; failed: JobProblem[]; retrying: JobProblem[] } | null> {
  const lanes = LANE_NAMES.map((lane) => [lane, getQueue(lane)] as const);
  if (connecting) await connecting;
  if (lanes.some(([, q]) => !q) || !queueReady()) return null;
  const problem = (lane: Lane) => (job: Job): JobProblem => ({
    lane,
    name: job.name,
    id: job.id ?? null,
    reason: (job.failedReason || 'No reason recorded').slice(0, 300),
    attempts: job.attemptsMade,
    at: job.finishedOn ? new Date(job.finishedOn).toISOString() : job.processedOn ? new Date(job.processedOn).toISOString() : null,
  });
  const byLatest = (a: JobProblem, b: JobProblem) => (b.at ?? '').localeCompare(a.at ?? '');
  try {
    const read = await withTimeout(
      Promise.all(
        lanes.map(async ([lane, q]) => {
          const [counts, workers, failed, delayed] = await Promise.all([
            q!.getJobCounts('waiting', 'active', 'delayed', 'failed'),
            q!.getWorkersCount(),
            q!.getFailed(0, limit - 1),
            q!.getDelayed(0, limit - 1),
          ]);
          return {
            lane: { lane, waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0, workers },
            failed: failed.filter(Boolean).map(problem(lane)),
            retrying: delayed.filter((j) => j && j.attemptsMade > 0).map(problem(lane)),
          };
        })
      ),
      ENQUEUE_TIMEOUT_MS
    );
    return {
      lanes: read.map((r) => r.lane),
      failed: read.flatMap((r) => r.failed).sort(byLatest).slice(0, limit),
      retrying: read.flatMap((r) => r.retrying).sort(byLatest).slice(0, limit),
    };
  } catch (err) {
    logger.warn({ err }, 'Could not read the job lanes');
    return null;
  }
}
