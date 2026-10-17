/**
 * What `promise` settles with, or `fallback` if it has not settled within `ms`. For a test of something that must not
 * hang: it fails with a plain "still waiting" instead of running into the test timeout, and the timer does not outlive the race.
 */
export async function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
