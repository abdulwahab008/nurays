/**
 * Where the sign-in tokens are kept. The web app keeps them in the browser: in localStorage (shared by every tab and
 * kept when the browser closes), or in sessionStorage for a tab that keeps its own session apart from the others (the
 * developer login page does that, to be signed in as two people at once).
 *
 * Everything that reads or writes a token goes through the one store `tokenStore()` returns, so a native shell can keep
 * them somewhere safer (the phone's keychain or keystore) by calling `setTokenStore()` once, before the app renders.
 * The interface is synchronous because the request interceptor needs the token at once; a store backed by an
 * asynchronous plugin keeps a copy in memory, loads it before the app starts and writes through on every change.
 *
 * No imports, so `npm test` covers it (tests/unit/token-store.test.ts).
 */

export interface TokenStore {
  /** The access token, or null when signed out. */
  access(): string | null;
  /** The refresh token, or null when signed out. */
  refresh(): string | null;
  /** Save a new access token; the refresh token stays. `isolated` keeps it in this tab alone. */
  saveAccess(token: string, isolated?: boolean): void;
  /** Save a new pair (after signing in or a refresh). */
  savePair(access: string, refresh: string, isolated?: boolean): void;
  /** Forget both tokens, and that this tab was kept apart. */
  clear(): void;
  /** True when this tab keeps its own session apart from the other tabs. */
  tabIsolated(): boolean;
}

/** The part of the browser's storage the store uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface BrowserStorages {
  /** This tab's own storage. */
  session: StorageLike;
  /** The storage every tab shares. */
  local: StorageLike;
}

const ACCESS = 'access_token';
const REFRESH = 'refresh_token';
const ISOLATED = 'tab_isolated';

const inTheBrowser = (): BrowserStorages | null =>
  typeof window === 'undefined' ? null : { session: sessionStorage, local: localStorage };

/**
 * The store for a browser. `storages` says which storage to use (null when there is none, on the server, where
 * everything reads as signed out and nothing is written); tests pass their own.
 */
export function browserTokenStore(storages: () => BrowserStorages | null = inTheBrowser): TokenStore {
  const isolatedTab = (s: BrowserStorages) => s.session.getItem(ISOLATED) === 'true';
  return {
    access() {
      const s = storages();
      return s ? s.session.getItem(ACCESS) || s.local.getItem(ACCESS) : null;
    },
    refresh() {
      const s = storages();
      return s ? s.session.getItem(REFRESH) || s.local.getItem(REFRESH) : null;
    },
    saveAccess(token, isolated = false) {
      const s = storages();
      if (!s) return;
      if (isolated || isolatedTab(s)) {
        s.session.setItem(ISOLATED, 'true');
        s.session.setItem(ACCESS, token);
      } else {
        s.local.setItem(ACCESS, token);
      }
    },
    savePair(access, refresh, isolated = false) {
      const s = storages();
      if (!s) return;
      if (isolated || isolatedTab(s)) {
        s.session.setItem(ISOLATED, 'true');
        s.session.setItem(ACCESS, access);
        s.session.setItem(REFRESH, refresh);
      } else {
        s.local.setItem(ACCESS, access);
        s.local.setItem(REFRESH, refresh);
      }
    },
    clear() {
      const s = storages();
      if (!s) return;
      s.session.removeItem(ACCESS);
      s.session.removeItem(REFRESH);
      s.session.removeItem(ISOLATED);
      s.local.removeItem(ACCESS);
      s.local.removeItem(REFRESH);
    },
    tabIsolated() {
      const s = storages();
      return s ? isolatedTab(s) : false;
    },
  };
}

let current: TokenStore = browserTokenStore();

/** The store every token read and write goes through. */
export const tokenStore = (): TokenStore => current;

/** Replace the store (a native shell's secure storage), before the app renders. */
export function setTokenStore(store: TokenStore): void {
  current = store;
}
