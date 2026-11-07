/**
 * Timing for reconnects and fallback polling. Every client of a restarted server notices at the same moment, so
 * every wait here is spread at random and grows while the trouble lasts: the clients come back over seconds,
 * not all in the same instant, and a struggling server is asked less often, never more.
 */

/** `ms` spread evenly over ±`spread` of itself. */
export function jitter(ms: number, spread = 0.5, random: () => number = Math.random): number {
  return Math.round(ms * (1 - spread + 2 * spread * random()));
}

/** The wait before retry number `attempt` (0 for the first): `baseMs` doubled each time up to `maxMs`, then spread. */
export function backoff(attempt: number, baseMs: number, maxMs: number, spread = 0.5, random: () => number = Math.random): number {
  return jitter(Math.min(maxMs, baseMs * 2 ** attempt), spread, random);
}

export interface PollTiming {
  connected: boolean;
  /** Polls already made since the connection went down (0 for the first). */
  offlinePolls: number;
  intervalMs: number;
  offlineMs: number;
  offlineMaxMs: number;
}

/**
 * The wait before the next safety-net reload. Connected: `intervalMs` ±20%. Disconnected: the first reload comes
 * after `offlineMs` (or `intervalMs` when that is sooner), then the wait doubles up to `offlineMaxMs`, ±20%.
 * With the defaults (60 s live, 30 s then 60 s then 120 s offline) a page asks at most twice as often as when
 * live, for one poll, and less often than live from the third: losing the socket because the server is in
 * trouble no longer multiplies the load on it.
 */
export function nextPollDelay(timing: PollTiming, random: () => number = Math.random): number {
  const { connected, offlinePolls, intervalMs, offlineMs, offlineMaxMs } = timing;
  if (connected) return jitter(intervalMs, 0.2, random);
  const first = Math.min(intervalMs, offlineMs);
  return backoff(offlinePolls, first, Math.max(offlineMaxMs, first), 0.2, random);
}

/**
 * The wait before an event-driven reload, limited to one per `minGapMs`: after a quiet spell it comes after the
 * short `debounceMs` (so a burst still becomes one reload), otherwise at `lastRunAt + minGapMs`.
 */
export function eventReloadDelay(now: number, lastRunAt: number, minGapMs: number, debounceMs: number): number {
  return Math.max(debounceMs, lastRunAt + minGapMs - now);
}
