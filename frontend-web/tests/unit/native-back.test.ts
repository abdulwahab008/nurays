// Run with `node --test --experimental-strip-types tests/unit/native-back.test.ts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canGoBack, historyDepth, trackHistoryDepth } from '../../lib/native-back.ts';

/** A history like the browser's: a list of entries, a position, and entries ahead dropped on push. */
function fakeHistory() {
  const entries: unknown[] = [null];
  let at = 0;
  const h: Pick<History, 'state' | 'pushState' | 'replaceState' | 'back' | 'forward' | 'length'> = {
    get state() {
      return entries[at];
    },
    pushState(data: unknown) {
      entries.splice(at + 1, entries.length, data);
      at += 1;
    },
    replaceState(data: unknown) {
      entries[at] = data;
    },
    back() {
      if (at > 0) at -= 1;
    },
    forward() {
      if (at < entries.length - 1) at += 1;
    },
    get length() {
      return entries.length;
    },
  };
  return h;
}

test('Back goes back after in-app navigations and closes the app on the first page', () => {
  const h = fakeHistory();
  trackHistoryDepth(h);
  assert.equal(canGoBack(false, h.state), false);
  h.pushState({ __NA: true }, '', '/products');
  h.pushState({ __NA: true }, '', '/products/1');
  assert.equal(historyDepth(h.state), 2);
  let presses = 0;
  while (canGoBack(false, h.state)) {
    h.back();
    presses += 1;
    assert.ok(presses < 10, 'Back never reached the first page');
  }
  assert.equal(presses, 2);
});

test('entries ahead of the first page do not keep the app open', () => {
  const h = fakeHistory();
  trackHistoryDepth(h);
  h.pushState(null, '', '/a');
  h.back();
  assert.equal(h.length, 2);
  assert.equal(canGoBack(false, h.state), false);
  h.forward();
  assert.equal(canGoBack(false, h.state), true);
});

test('replacing an entry keeps its depth and the caller’s state', () => {
  const h = fakeHistory();
  trackHistoryDepth(h);
  h.pushState({ __NA: true }, '', '/a');
  const data = { __NA: true, tree: 1 };
  h.replaceState(data, '', '/a?x=1');
  assert.deepEqual(h.state, { __NA: true, tree: 1, __nurayDepth: 1 });
  assert.deepEqual(data, { __NA: true, tree: 1 });
});

test('wrapping twice (a re-run effect) still counts one step per push', () => {
  const h = fakeHistory();
  trackHistoryDepth(h);
  trackHistoryDepth(h);
  h.pushState(null, '', '/a');
  assert.equal(historyDepth(h.state), 1);
});

test('stopping restores the original methods unless something wrapped them since', () => {
  const h = fakeHistory();
  const push = h.pushState;
  trackHistoryDepth(h)();
  assert.equal(h.pushState, push);
  const stop = trackHistoryDepth(h);
  const outer = h.pushState;
  h.pushState = (data, unused, url) => outer.call(h, data, unused, url);
  stop();
  h.pushState(null, '', '/a');
  assert.equal(historyDepth(h.state), 1);
});

test('the native flag still counts, and odd states read as the first page', () => {
  assert.equal(canGoBack(true, null), true);
  assert.equal(historyDepth('text'), 0);
  assert.equal(historyDepth({ __nurayDepth: -1 }), 0);
});
