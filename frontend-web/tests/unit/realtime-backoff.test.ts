import test from 'node:test';
import assert from 'node:assert/strict';
import { backoff, eventReloadDelay, jitter, nextPollDelay } from '../../lib/realtime/backoff.ts';

const low = () => 0;
const high = () => 1;
const mid = () => 0.5;

test('jitter spreads a wait evenly over ± its spread', () => {
  assert.equal(jitter(10_000, 0.5, low), 5_000);
  assert.equal(jitter(10_000, 0.5, mid), 10_000);
  assert.equal(jitter(10_000, 0.5, high), 15_000);
});

test('backoff doubles each attempt and stops at the cap', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => backoff(n, 3_000, 60_000, 0.5, mid)), [3_000, 6_000, 12_000, 24_000, 48_000, 60_000]);
});

const page = { intervalMs: 60_000, offlineMs: 30_000, offlineMaxMs: 120_000 };

test('connected, the safety poll runs at its interval ±20%', () => {
  assert.equal(nextPollDelay({ ...page, connected: true, offlinePolls: 0 }, mid), 60_000);
  assert.equal(nextPollDelay({ ...page, connected: true, offlinePolls: 0 }, low), 48_000);
  assert.equal(nextPollDelay({ ...page, connected: true, offlinePolls: 0 }, high), 72_000);
});

test('without the socket, polling slows down instead of speeding up', () => {
  const waits = [0, 1, 2, 3, 4].map((offlinePolls) => nextPollDelay({ ...page, connected: false, offlinePolls }, mid));
  assert.deepEqual(waits, [30_000, 60_000, 120_000, 120_000, 120_000]);
  // never more than twice the live rate, and only for the first poll
  assert.ok(waits.every((w, i) => w >= (i === 0 ? page.intervalMs / 2 : page.intervalMs)));
});

test('a page whose interval is shorter than the offline wait starts at its own interval', () => {
  const rider = { intervalMs: 20_000, offlineMs: 30_000, offlineMaxMs: 120_000, connected: false };
  assert.equal(nextPollDelay({ ...rider, offlinePolls: 0 }, mid), 20_000);
  assert.equal(nextPollDelay({ ...rider, offlinePolls: 1 }, mid), 40_000);
});

test('the chat stays between 15 s and 30 s while offline', () => {
  const chat = { intervalMs: 30_000, offlineMs: 15_000, offlineMaxMs: 30_000, connected: false };
  assert.deepEqual([0, 1, 2, 3].map((offlinePolls) => nextPollDelay({ ...chat, offlinePolls }, mid)), [15_000, 30_000, 30_000, 30_000]);
});

test('an event reload is rate limited, not delayed: the first after a quiet spell runs at once', () => {
  const now = 1_000_000;
  // Last reload long ago: only the short debounce.
  assert.equal(eventReloadDelay(now, now - 60_000, 30_000, 250), 250);
  assert.equal(eventReloadDelay(now, 0, 30_000, 250), 250);
  // Reloaded 10 s ago: wait until 30 s after that reload.
  assert.equal(eventReloadDelay(now, now - 10_000, 30_000, 250), 20_000);
  // Nearly due: never sooner than the debounce.
  assert.equal(eventReloadDelay(now, now - 29_900, 30_000, 250), 250);
  // The default (coalesce equal to the debounce) behaves as before.
  assert.equal(eventReloadDelay(now, now - 100, 250, 250), 250);
});
