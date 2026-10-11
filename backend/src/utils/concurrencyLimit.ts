/**
 * Runs at most `max` jobs at a time; the rest wait their turn, first come first served. For work whose cost is memory
 * or CPU rather than waiting (decoding photos), so a burst of requests queues instead of all running at once.
 */
export function concurrencyLimit(max: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (running < max) running += 1;
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
