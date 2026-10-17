// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserTokenStore, setTokenStore, tokenStore, type StorageLike, type TokenStore } from '../../lib/token-store.ts';

/** A stand-in for a browser storage that remembers what was written. */
function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function setup() {
  const session = memory();
  const local = memory();
  return { session, local, store: browserTokenStore(() => ({ session, local })) };
}

test('a new pair is kept for every tab, in the shared storage', () => {
  const { session, local, store } = setup();
  store.savePair('a1', 'r1');
  assert.equal(local.getItem('access_token'), 'a1');
  assert.equal(local.getItem('refresh_token'), 'r1');
  assert.equal(session.data.size, 0, 'nothing in this tab\'s own storage');
  assert.equal(store.access(), 'a1');
  assert.equal(store.refresh(), 'r1');
  assert.equal(store.tabIsolated(), false);
});

test('a tab asked to keep its own session uses its own storage, and remembers that it did', () => {
  const { session, local, store } = setup();
  store.savePair('a1', 'r1', true);
  assert.equal(session.getItem('access_token'), 'a1');
  assert.equal(session.getItem('refresh_token'), 'r1');
  assert.equal(session.getItem('tab_isolated'), 'true');
  assert.equal(local.data.size, 0, 'the other tabs\' storage is left alone');
  assert.equal(store.tabIsolated(), true);
  // a later save, without being asked again, stays in this tab
  store.savePair('a2', 'r2');
  assert.equal(session.getItem('access_token'), 'a2');
  assert.equal(local.data.size, 0);
  store.saveAccess('a3');
  assert.equal(session.getItem('access_token'), 'a3');
  assert.equal(session.getItem('refresh_token'), 'r2', 'the refresh token stays');
  assert.equal(local.data.size, 0);
});

test('a new access token keeps the refresh token', () => {
  const { local, store } = setup();
  store.savePair('a1', 'r1');
  store.saveAccess('a2');
  assert.equal(store.access(), 'a2');
  assert.equal(store.refresh(), 'r1');
  assert.equal(local.getItem('refresh_token'), 'r1');
});

test('this tab\'s own tokens are read before the shared ones', () => {
  const { session, local, store } = setup();
  local.setItem('access_token', 'shared');
  local.setItem('refresh_token', 'shared-r');
  assert.equal(store.access(), 'shared');
  session.setItem('access_token', 'mine');
  assert.equal(store.access(), 'mine');
  assert.equal(store.refresh(), 'shared-r', 'a token this tab does not have comes from the shared storage');
});

test('signing out forgets both tokens everywhere, and that the tab was kept apart', () => {
  const { session, local, store } = setup();
  store.savePair('a1', 'r1', true);
  local.setItem('access_token', 'shared');
  local.setItem('refresh_token', 'shared-r');
  store.clear();
  assert.equal(session.data.size, 0);
  assert.equal(local.data.size, 0);
  assert.equal(store.access(), null);
  assert.equal(store.refresh(), null);
  assert.equal(store.tabIsolated(), false);
});

test('clearing leaves what is not a token alone', () => {
  const { local, store } = setup();
  local.setItem('auth-storage', '{"state":{}}');
  store.savePair('a1', 'r1');
  store.clear();
  assert.equal(local.getItem('auth-storage'), '{"state":{}}');
});

test('with no browser (the server) everything reads as signed out and nothing is written or thrown', () => {
  const store = browserTokenStore(() => null);
  assert.equal(store.access(), null);
  assert.equal(store.refresh(), null);
  assert.equal(store.tabIsolated(), false);
  store.savePair('a', 'r');
  store.saveAccess('a');
  store.clear();
});

test('the store in use can be replaced, as a native shell does with its secure storage', () => {
  const original = tokenStore();
  const secure = new Map<string, string>();
  const native: TokenStore = {
    access: () => secure.get('a') ?? null,
    refresh: () => secure.get('r') ?? null,
    saveAccess: (token) => void secure.set('a', token),
    savePair: (access, refresh) => {
      secure.set('a', access);
      secure.set('r', refresh);
    },
    clear: () => secure.clear(),
    tabIsolated: () => false,
  };
  try {
    setTokenStore(native);
    assert.equal(tokenStore(), native);
    tokenStore().savePair('a1', 'r1');
    assert.equal(secure.get('a'), 'a1');
    assert.equal(tokenStore().access(), 'a1');
    tokenStore().clear();
    assert.equal(tokenStore().access(), null);
  } finally {
    setTokenStore(original);
  }
  assert.equal(tokenStore(), original);
});
