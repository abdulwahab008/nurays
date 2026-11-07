import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTEMPT_TTL_MS, attemptMayExist, checkoutKeyFor, forgetCheckoutKey } from '../../app/checkout/checkout-key.ts';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

let n = 0;
const fresh = () => `key-${++n}`;

test('the same order keeps its key across a remount or reload of the page', () => {
  const tab = memoryStore();
  const first = checkoutKeyFor(tab, '{"items":1}', fresh);
  // A reload loses the in-memory attempt; overwrite it so only the tab's storage can answer.
  checkoutKeyFor(memoryStore(), '{"other":true}', fresh);
  assert.equal(checkoutKeyFor(tab, '{"items":1}', fresh), first);
});

test('a changed order gets a new key', () => {
  const tab = memoryStore();
  const first = checkoutKeyFor(tab, '{"items":1}', fresh);
  assert.notEqual(checkoutKeyFor(tab, '{"items":2}', fresh), first);
});

test('after the order is placed the next attempt gets a new key', () => {
  const tab = memoryStore();
  const first = checkoutKeyFor(tab, '{"items":1}', fresh);
  forgetCheckoutKey(tab);
  assert.notEqual(checkoutKeyFor(tab, '{"items":1}', fresh), first);
});

test('a blocked storage still reuses the key within the page', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const first = checkoutKeyFor(blocked, '{"items":3}', fresh);
  assert.equal(checkoutKeyFor(blocked, '{"items":3}', fresh), first);
});

test('the key is kept when the order may exist, and dropped only on a refusal', () => {
  assert.equal(attemptMayExist(undefined), true);
  assert.equal(attemptMayExist(504), true);
  assert.equal(attemptMayExist(500), true);
  assert.equal(attemptMayExist(409), false);
  assert.equal(attemptMayExist(400), false);
});

test('an identical order after the attempt expired gets a new key instead of replaying the old order', () => {
  const tab = memoryStore();
  const start = 1_000_000;
  const first = checkoutKeyFor(tab, '{"items":4}', fresh, start);
  assert.equal(checkoutKeyFor(tab, '{"items":4}', fresh, start + ATTEMPT_TTL_MS - 1), first);
  const later = checkoutKeyFor(tab, '{"items":4}', fresh, start + ATTEMPT_TTL_MS);
  assert.notEqual(later, first);
  // The expiry counts from the first try of the new attempt, not from each retry.
  assert.equal(checkoutKeyFor(tab, '{"items":4}', fresh, start + ATTEMPT_TTL_MS + 1), later);
});

test('an attempt stored without a start time is treated as expired', () => {
  const tab = memoryStore();
  forgetCheckoutKey(tab);
  tab.setItem('checkoutAttempt', JSON.stringify({ key: 'legacy', signature: '{"items":5}' }));
  assert.notEqual(checkoutKeyFor(tab, '{"items":5}', fresh), 'legacy');
});
