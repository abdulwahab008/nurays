type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Attempt = { key: string; signature: string; startedAt: number };

const STORAGE_KEY = 'checkoutAttempt';
/**
 * How long an unfinished attempt keeps its key. Long enough to retry after a timeout; past it, the same order is
 * a deliberate re-order and must not be answered with the order an old timed-out attempt may have placed.
 */
export const ATTEMPT_TTL_MS = 10 * 60_000;

// sessionStorage keeps the key across a reload or a remount of the page; the
// in-memory copy covers browsers where storage is blocked and throws.
let memory: Attempt | null = null;

function read(store: KeyStore | undefined): Attempt | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        'key' in parsed &&
        'signature' in parsed &&
        'startedAt' in parsed &&
        typeof parsed.key === 'string' &&
        typeof parsed.signature === 'string' &&
        typeof parsed.startedAt === 'number'
      ) {
        return { key: parsed.key, signature: parsed.signature, startedAt: parsed.startedAt };
      }
    }
  } catch {
    // Unreadable storage: fall back to the in-memory attempt.
  }
  return memory;
}

/** The tab's sessionStorage, or undefined where reading it throws (storage blocked). */
export function sessionStore(): KeyStore | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The Idempotency-Key for placing this exact order: the same key while the order
 * (the signature) is unchanged, so a retry after a timeout, reload or double press
 * returns the order already placed instead of creating a second one, until ATTEMPT_TTL_MS after the first try.
 */
export function checkoutKeyFor(store: KeyStore | undefined, signature: string, newKey: () => string, now = Date.now()): string {
  const current = read(store);
  if (current && current.signature === signature && now - current.startedAt < ATTEMPT_TTL_MS) return current.key;
  memory = { key: newKey(), signature, startedAt: now };
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the in-memory attempt still dedupes within this page.
  }
  return memory.key;
}

/** The attempt is over (placed, or refused by the server): the next order gets a new key. */
export function forgetCheckoutKey(store: KeyStore | undefined): void {
  memory = null;
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/**
 * Whether a failed attempt may still have placed the order, so its key must be kept for
 * the retry. With no answer (timeout, connection lost) or a 5xx (a proxy's 502/504 can
 * arrive after the order committed) it may; a 4xx means the server refused it.
 */
export function attemptMayExist(status: number | undefined): boolean {
  return status === undefined || status >= 500;
}
