import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACEHOLDER_URL } from '../app-url.ts';
import { withAppUrl } from '../scripts/offline-page.ts';

const page = readFileSync(new URL('../www/offline.html', import.meta.url), 'utf8');

test('the committed offline page carries the placeholder address, so a sync without NURAY_APP_URL leaves it unchanged', () => {
  assert.equal(withAppUrl(page, PLACEHOLDER_URL), page);
});

test('the address is written into the page, and writing it again replaces it', () => {
  const once = withAppUrl(page, 'https://nuray.pk');
  assert.match(once, /const appUrl = "https:\/\/nuray\.pk";/);
  assert.ok(!once.includes(PLACEHOLDER_URL));
  assert.equal(withAppUrl(withAppUrl(once, 'http://192.168.1.20:3000'), 'https://nuray.pk'), once);
});

test('the offline page loads no other file (on Android the app serves only this page)', () => {
  assert.doesNotMatch(page, /\s(src|href)=/);
});

test('a page without the address line is refused rather than silently left pointing nowhere', () => {
  assert.throws(() => withAppUrl('<html></html>', 'https://nuray.pk'), /no `const appUrl/);
});
