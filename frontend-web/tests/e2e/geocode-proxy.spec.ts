import { test, expect } from '@playwright/test';
import { createRateGuard } from '../../lib/rate-guard';
import { clientAddress, numberSetting, withApiKey } from '../../lib/geocode-proxy';

/**
 * The geocoder proxy shares one upstream account between everybody, so one address must not be able to fill
 * its queue, and a paid provider's key and pace must be configurable without code changes.
 */

test.describe('per-address guard', () => {
  test('lets an address make its quota in a window and refuses the rest until the window is over', () => {
    let now = 1_000_000;
    const guard = createRateGuard(3, 60_000, () => now);
    expect([1, 2, 3, 4, 5].map(() => guard.allow('1.2.3.4'))).toEqual([true, true, true, false, false]);
    expect(guard.allow('5.6.7.8')).toBe(true); // another address has its own count
    now += 59_999;
    expect(guard.allow('1.2.3.4')).toBe(false);
    now += 1;
    expect(guard.allow('1.2.3.4')).toBe(true); // a new window
  });

  test('forgets old windows when many addresses have been seen', () => {
    let now = 0;
    const guard = createRateGuard(1, 1000, () => now);
    for (let i = 0; i < 6000; i++) guard.allow(`10.0.${Math.floor(i / 250)}.${i % 250}`);
    now += 5000;
    // the sweep runs on the next call; every old address starts over
    expect(guard.allow('10.0.0.1')).toBe(true);
    expect(guard.allow('10.0.0.1')).toBe(false);
  });

  test('does not grow without end when every request claims to be a new address', () => {
    let now = 0;
    const guard = createRateGuard(1, 600_000, () => now);
    for (let i = 0; i < 60_000; i++) {
      if (i % 1000 === 0) now += 1000; // a second passes every thousand calls
      guard.allow(`spoofed-${i}`);
    }
    // the table was emptied once it passed the cap: an address seen before the reset starts over, one after it is still counted
    expect(guard.allow('spoofed-0')).toBe(true);
    expect(guard.allow('spoofed-59999')).toBe(false);
  });
});

test.describe('provider settings', () => {
  test('a number from the environment is used only when it is a valid number', () => {
    expect(numberSetting(undefined, 20, 1)).toBe(20);
    expect(numberSetting('', 20, 1)).toBe(20);
    expect(numberSetting('abc', 20, 1)).toBe(20);
    expect(numberSetting('0', 20, 1)).toBe(20); // below the minimum
    expect(numberSetting('50', 20, 1)).toBe(50);
    expect(numberSetting('0', 1100, 0)).toBe(0); // no pacing is a valid choice for a paid account
  });

  test('the provider key travels in the query and is never part of what is cached', () => {
    expect(withApiKey('https://geo.test/search?q=a', undefined)).toBe('https://geo.test/search?q=a');
    expect(withApiKey('https://geo.test/search?q=a', 'k 1')).toBe('https://geo.test/search?q=a&key=k%201');
    expect(withApiKey('https://geo.test/search', 'k', 'apiKey')).toBe('https://geo.test/search?apiKey=k');
  });

  test('the asker is the first forwarded address, else the real address, else unknown', () => {
    const req = (headers: Record<string, string>) => new Request('http://localhost/api/geocode/search', { headers });
    expect(clientAddress(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }))).toBe('203.0.113.7');
    expect(clientAddress(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientAddress(req({}))).toBe('unknown');
  });
});

test('the routes still refuse a request with nothing to look up', async ({ request }) => {
  expect((await request.get('/api/geocode/search')).status()).toBe(400);
  expect((await request.get('/api/geocode/reverse?lat=x&lon=y')).status()).toBe(400);
});
