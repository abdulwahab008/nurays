/**
 * A counter per key (an address) over a fixed window: `allow(key)` is false once `limit` calls have been
 * made in the current window. In memory, so each server process counts for itself; meant as a flood
 * guard, not an exact quota. The clock is a parameter so it can be tested.
 */
export function createRateGuard(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = 0;
  return {
    allow(key: string): boolean {
      const t = now();
      // Old windows are swept out at most once a second, and only when the table is big, so a flood of
      // different keys cannot make every call walk the whole table.
      if (windows.size > 5000 && t - lastSweep >= 1000) {
        lastSweep = t;
        for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
        // Addresses can be invented by whoever sends the header: never let the table grow without end.
        if (windows.size > 50_000) windows.clear();
      }
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        return true;
      }
      w.count++;
      return w.count <= limit;
    },
  };
}
