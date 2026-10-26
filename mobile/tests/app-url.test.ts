import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReleasable, PLACEHOLDER_URL, resolveAppUrl } from '../app-url.ts';

test('without NURAY_APP_URL the placeholder stands, and is not releasable', () => {
  const app = resolveAppUrl({});
  assert.equal(app.url, PLACEHOLDER_URL);
  assert.equal(app.placeholder, true);
  assert.throws(() => assertReleasable(app), /not set/);
});

test('an https site is used as its origin and is releasable', () => {
  const app = resolveAppUrl({ NURAY_APP_URL: ' https://nuray.pk/ ' });
  assert.deepEqual(app, { url: 'https://nuray.pk', hostname: 'nuray.pk', placeholder: false });
  assert.doesNotThrow(() => assertReleasable(app));
});

test('plain http only for a local address, and never releasable', () => {
  assert.throws(() => resolveAppUrl({ NURAY_APP_URL: 'http://nuray.pk' }), /must be https/);
  const local = resolveAppUrl({ NURAY_APP_URL: 'http://192.168.1.20:3000' });
  assert.equal(local.url, 'http://192.168.1.20:3000');
  assert.throws(() => assertReleasable(local), /https/);
});

test('an address with a path, or not an address, is refused', () => {
  assert.throws(() => resolveAppUrl({ NURAY_APP_URL: 'https://nuray.pk/app' }), /without a path/);
  assert.throws(() => resolveAppUrl({ NURAY_APP_URL: 'nuray' }), /not an address/);
});
