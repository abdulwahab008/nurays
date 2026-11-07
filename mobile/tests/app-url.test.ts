import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReleasable, IN_APP_HOSTS, PLACEHOLDER_URL, resolveAppUrl } from '../app-url.ts';

test('without NURAY_APP_URL the placeholder stands, and is not releasable', () => {
  const app = resolveAppUrl({});
  assert.equal(app.url, PLACEHOLDER_URL);
  assert.equal(app.placeholder, true);
  assert.throws(() => assertReleasable(app), /not set/);
});

test('an https site is used as its origin and is releasable', () => {
  const app = resolveAppUrl({ NURAY_APP_URL: ' https://nuray.pk/ ', NURAY_API_URL: 'https://api.nuray.pk' });
  assert.deepEqual(app, {
    url: 'https://nuray.pk',
    hostname: 'nuray.pk',
    placeholder: false,
    api: { url: 'https://api.nuray.pk', hostname: 'api.nuray.pk' },
  });
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

test('a release build needs an https NURAY_API_URL, where Safepay returns a paid customer', () => {
  assert.throws(() => assertReleasable(resolveAppUrl({ NURAY_APP_URL: 'https://nuray.pk' })), /NURAY_API_URL is not set/);
  const localApi = resolveAppUrl({ NURAY_APP_URL: 'https://nuray.pk', NURAY_API_URL: 'http://10.0.2.2:3001' });
  assert.equal(localApi.api?.hostname, '10.0.2.2');
  assert.throws(() => assertReleasable(localApi), /https API/);
  assert.throws(() => resolveAppUrl({ NURAY_API_URL: 'http://api.nuray.pk' }), /NURAY_API_URL must be https/);
  assert.throws(() => resolveAppUrl({ NURAY_API_URL: 'https://api.nuray.pk/api/v1' }), /NURAY_API_URL must be .* without a path/);
});

// The same rule as both phones (Capacitor's HostMask on Android, doesHost on iOS): equal label count, * is one label.
function opensInApp(host: string): boolean {
  const hostLabels = host.toLowerCase().split('.');
  return IN_APP_HOSTS.some((pattern) => {
    const labels = pattern.split('.');
    return labels.length === hostLabels.length && labels.every((label, i) => label === '*' || label === hostLabels[i]);
  });
}

test("Safepay's live and sandbox checkout hosts open inside the app, look-alikes do not", () => {
  for (const host of ['getsafepay.com', 'api.getsafepay.com', 'sandbox.api.getsafepay.com']) assert.ok(opensInApp(host), host);
  for (const host of ['getsafepay.com.evil.pk', 'notgetsafepay.com']) assert.ok(!opensInApp(host), host);
});
