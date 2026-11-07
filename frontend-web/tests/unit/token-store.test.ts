// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserTokenStore, type StorageLike } from '../../lib/token-store.ts';

/** A stand-in for this tab's sessionStorage that remembers what was written. */
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
  return { session, store: browserTokenStore(() => session) };
}

test('a signed-in page keeps the access token in memory only, and never a refresh token', () => {
  const { session, store } = setup();
  store.save('a1', 'r1');
  assert.equal(store.access(), 'a1');
  assert.equal(store.refresh(), null, 'the refresh token is the httpOnly cookie');
  assert.equal(session.data.size, 0, 'nothing is written to storage');
  assert.equal(store.tabIsolated(), false);
});

test('a refresh answer replaces the access token', () => {
  const { store } = setup();
  store.save('a1');
  store.save('a2');
  assert.equal(store.access(), 'a2');
});

test('a tab kept apart keeps its own pair in its own storage, and remembers that it is', () => {
  const { session, store } = setup();
  store.save('a1', 'r1', true);
  assert.equal(session.getItem('access_token'), 'a1');
  assert.equal(session.getItem('refresh_token'), 'r1');
  assert.equal(store.tabIsolated(), true);
  store.save('a2');
  assert.equal(store.access(), 'a2', 'a later save stays in this tab without being asked again');
  assert.equal(store.refresh(), 'r1', 'an answer with no refresh token keeps the one it has');
  store.save('a3', 'r3');
  assert.equal(store.refresh(), 'r3');
});

test('signing out forgets the tokens and that the tab was kept apart', () => {
  const { session, store } = setup();
  store.save('a1', 'r1', true);
  session.setItem('auth-storage', '{"state":{}}');
  store.clear();
  assert.equal(store.access(), null);
  assert.equal(store.refresh(), null);
  assert.equal(store.tabIsolated(), false);
  assert.deepEqual([...session.data.keys()], ['auth-storage'], 'what is not a token stays');

  const plain = setup().store;
  plain.save('a1');
  plain.clear();
  assert.equal(plain.access(), null);
});

test('with no browser (the server) everything reads as signed out and nothing is thrown', () => {
  const store = browserTokenStore(() => null);
  store.save('a', 'r');
  assert.equal(store.refresh(), null);
  assert.equal(store.tabIsolated(), false);
  store.clear();
  assert.equal(store.access(), null);
});
