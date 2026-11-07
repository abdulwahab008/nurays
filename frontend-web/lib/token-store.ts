/**
 * Where the sign-in tokens are kept. The refresh token is an httpOnly cookie the API sets: no page script can read it,
 * so an injected script cannot carry a long-lived sign-in away. The short-lived access token lives in this page's memory
 * only; after a reload the first request is answered 401 and the client gets a new one through the cookie.
 *
 * A tab kept apart from the others (the developer login page, to be signed in as two people at once) cannot share the
 * one cookie, so it keeps its own pair in sessionStorage. Outside production the API still returns the refresh token
 * in its answers for that; in production it does not, and such a tab signs in again when its access token expires.
 *
 * No imports, so `npm test` covers it (tests/unit/token-store.test.ts).
 */

export interface TokenStore {
  /** The access token, or null when there is none in this page yet. */
  access(): string | null;
  /** A refresh token this page holds itself: only a tab kept apart does. Otherwise the cookie carries it. */
  refresh(): string | null;
  /** Keep a new access token, and the refresh token when this tab is kept apart. */
  save(access: string, refresh?: string | null, isolated?: boolean): void;
  /** Forget both, and that this tab was kept apart. */
  clear(): void;
  /** True when this tab keeps its own session apart from the other tabs. */
  tabIsolated(): boolean;
}

/** The part of the browser's storage the store uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Marks a request from a tab kept apart, so the API neither sets nor clears the browser's refresh cookie for it. */
export const ISOLATED_TAB_HEADER = 'X-Nuray-Isolated-Tab';

const ACCESS = 'access_token';
const REFRESH = 'refresh_token';
const ISOLATED = 'tab_isolated';

const tabStorage = (): StorageLike | null => (typeof window === 'undefined' ? null : sessionStorage);

/** The store for a browser; tests pass their own stand-in for sessionStorage. */
export function browserTokenStore(storage: () => StorageLike | null = tabStorage): TokenStore {
  let inMemory: string | null = null;
  const isolatedTab = (s: StorageLike | null) => s?.getItem(ISOLATED) === 'true';
  return {
    access() {
      const s = storage();
      return isolatedTab(s) ? s!.getItem(ACCESS) : inMemory;
    },
    refresh() {
      const s = storage();
      return isolatedTab(s) ? s!.getItem(REFRESH) : null;
    },
    save(access, refresh, isolated = false) {
      const s = storage();
      if (s && (isolated || isolatedTab(s))) {
        s.setItem(ISOLATED, 'true');
        s.setItem(ACCESS, access);
        if (refresh) s.setItem(REFRESH, refresh);
        return;
      }
      inMemory = access;
    },
    clear() {
      inMemory = null;
      const s = storage();
      s?.removeItem(ACCESS);
      s?.removeItem(REFRESH);
      s?.removeItem(ISOLATED);
    },
    tabIsolated() {
      return isolatedTab(storage());
    },
  };
}

// Tokens an earlier version kept in localStorage: a refresh token left there is still readable by any script.
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  } catch {
    /* storage blocked: there is nothing to remove */
  }
}

const current: TokenStore = browserTokenStore();

/** The store every token read and write goes through. */
export const tokenStore = (): TokenStore => current;
