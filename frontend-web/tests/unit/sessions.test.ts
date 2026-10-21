import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, sortDevices, type SignedInDevice } from '../../lib/sessions.ts';

test('names the common browsers and systems, and does not mistake Edge or Opera for Chrome', () => {
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
  const edge = `${chromeWin} Edg/129.0`;
  const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const firefoxMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0';
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
  assert.deepEqual(describeDevice(chromeWin), { browser: 'Chrome', os: 'Windows' });
  assert.deepEqual(describeDevice(edge), { browser: 'Edge', os: 'Windows' });
  assert.deepEqual(describeDevice(safariIphone), { browser: 'Safari', os: 'iPhone' });
  assert.deepEqual(describeDevice(firefoxMac), { browser: 'Firefox', os: 'Mac' });
  assert.deepEqual(describeDevice(androidChrome), { browser: 'Chrome', os: 'Android' });
});

test('says nothing it does not know', () => {
  assert.deepEqual(describeDevice(null), { browser: null, os: null });
  assert.deepEqual(describeDevice('curl/8.5.0'), { browser: null, os: null });
});

test('this device first, then the most recently active', () => {
  const d = (id: string, lastActiveAt: string, current = false): SignedInDevice => ({ id, current, userAgent: null, ipAddress: null, signedInAt: lastActiveAt, lastActiveAt });
  const sorted = sortDevices([d('old', '2026-10-01T00:00:00Z'), d('new', '2026-10-20T00:00:00Z'), d('here', '2026-09-01T00:00:00Z', true)]);
  assert.deepEqual(sorted.map((s) => s.id), ['here', 'new', 'old']);
});
