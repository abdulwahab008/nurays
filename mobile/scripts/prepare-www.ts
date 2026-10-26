/**
 * Before every sync: tells the page shown when the website cannot be reached (www/offline.html) where "Try again" goes,
 * by writing www/app-config.js from NURAY_APP_URL. With --release it also refuses the placeholder address.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertReleasable, resolveAppUrl } from '../app-url.ts';

const app = resolveAppUrl(process.env);
if (process.argv.includes('--release')) assertReleasable(app);
writeFileSync(join(import.meta.dirname, '..', 'www', 'app-config.js'), `window.NURAY_APP_URL = ${JSON.stringify(app.url)};\n`);
console.log(`The app opens ${app.url}${app.placeholder ? ' (placeholder: set NURAY_APP_URL)' : ''}.`);
