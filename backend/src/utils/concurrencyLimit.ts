/** Thrown instead of queueing when `maxWaiting` jobs are already waiting for a slot. */
export class QueueFullError extends Error {
  constructor() {
    super('Too many jobs waiting for a slot');
    this.name = 'QueueFullError';
  }
}

/**
 * Runs at most `max` jobs at a time; the rest wait their turn, first come first served. For work whose cost is memory
 * or CPU rather than waiting (decoding photos, hashing passwords), so a burst of requests queues instead of all running
 * at once. With `maxWaiting`, a job that would have to wait behind that many others is refused at once (QueueFullError):
 * an overload is answered quickly instead of piling up work nobody will still be waiting for.
 */
export function concurrencyLimit(max: number, { maxWaiting = Infinity }: { maxWaiting?: number } = {}) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (running < max) running += 1;
    else if (waiting.length >= maxWaiting) throw new QueueFullError();
    else await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over: the count stays
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}
