// Run with `node --test --experimental-strip-types tests/unit/open-external.test.ts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapsUrl, openExternal, type ExternalWindow } from '../../lib/open-external.ts';

test('map and directions links are recognised', () => {
  for (const url of [
    'https://www.google.com/maps/dir/?api=1&destination=24.9%2C67.1',
    'https://www.google.com/maps?q=24.9,67.1',
    'https://google.com.pk/maps/place/x',
    'https://maps.google.com/?q=x',
    'https://maps.app.goo.gl/abc',
    'https://maps.apple.com/?daddr=24.9,67.1&dirflg=d',
    'geo:24.9,67.1?q=24.9,67.1(Door)',
    'comgooglemaps://?daddr=24.9,67.1',
  ]) {
    assert.equal(isMapsUrl(url), true, url);
  }
});

test('other links are not maps', () => {
  for (const url of [
    'https://nuray.pk/refund-policy',
    'https://www.google.com/search?q=maps',
    'https://www.google.com/mapsx',
    'https://maps.example/route',
    'https://evil.com/maps.apple.com',
    'https://google.com.evil.com/maps',
    'tel:+923001234567',
    '/riders/dashboard',
    'not a url',
  ]) {
    assert.equal(isMapsUrl(url), false, url);
  }
});

function nativeWindow(launcher: () => Promise<unknown>) {
  const opened: string[] = [];
  const win: ExternalWindow = {
    open: (url) => {
      opened.push(`tab ${url}`);
      return null;
    },
    location: { assign: () => undefined, origin: 'https://nuray.pk' },
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        Browser: { open: async ({ url }) => void opened.push(`browser ${url}`) },
        AppLauncher: {
          openUrl: ({ url }) => {
            opened.push(`launcher ${url}`);
            return launcher();
          },
        },
      },
    },
  };
  return { win, opened };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const route = 'https://www.google.com/maps/dir/?api=1&destination=24.9,67.1';

test('in the app a map link goes to the launcher, and other web pages to the in-app browser', async () => {
  const { win, opened } = nativeWindow(async () => ({ completed: true }));
  openExternal(route, win);
  openExternal('/refund-policy', win);
  await settle();
  assert.deepEqual(opened, [`launcher ${route}`, 'browser https://nuray.pk/refund-policy']);
});

test('when the launcher fails or no app takes the link, the in-app browser opens it as before', async () => {
  const failed = nativeWindow(async () => {
    throw new Error('Invalid URL');
  });
  openExternal(route, failed.win);
  await settle();
  assert.deepEqual(failed.opened, [`launcher ${route}`, `browser ${route}`]);

  const declined = nativeWindow(async () => ({ completed: false }));
  openExternal(route, declined.win);
  await settle();
  assert.deepEqual(declined.opened, [`launcher ${route}`, `browser ${route}`]);
});
