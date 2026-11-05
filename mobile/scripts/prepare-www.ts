/**
 * Runs twice per sync.
 * - Before it (`npm run sync…`): checks NURAY_APP_URL, and with --release refuses the placeholder address.
 * - After `cap copy` has put the web files into a native project (the `capacitor:copy:after` hook, which sets
 *   CAPACITOR_PLATFORM_NAME): writes the address into that project's copy of offline.html, so "Try again" knows where
 *   to go. The committed www/offline.html keeps the placeholder.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertReleasable, resolveAppUrl } from '../app-url.ts';
import { COPIED_OFFLINE_PAGE, withAppUrl } from './offline-page.ts';

const app = resolveAppUrl(process.env);
if (process.argv.includes('--release')) assertReleasable(app);

const platform = process.env.CAPACITOR_PLATFORM_NAME;
if (platform) {
  const page = COPIED_OFFLINE_PAGE[platform];
  if (!page) throw new Error(`No offline page location known for platform ${platform}.`);
  const file = join(import.meta.dirname, '..', page);
  writeFileSync(file, withAppUrl(readFileSync(file, 'utf8'), app.url));
} else {
  console.log(`The app opens ${app.url}${app.placeholder ? ' (placeholder: set NURAY_APP_URL)' : ''}.`);
}
