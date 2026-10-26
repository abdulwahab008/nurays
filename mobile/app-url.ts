/**
 * Which website the app opens, and which other sites may open inside it. The app is a shell around the deployed Nuray
 * website (Capacitor's server URL mode), so one web build serves browsers and both store apps.
 *
 * NURAY_APP_URL is read when the native projects are synced (`npm run sync`): it is built into the app, so a change
 * needs a new sync and build. Until the production address is known a placeholder stands, which no store build may
 * carry (`assertReleasable`). No imports, so `npm test` covers it.
 */

export const PLACEHOLDER_URL = 'https://app.nuray.invalid';

/**
 * Sites that open inside the app rather than in the phone's browser: Safepay's payment pages, so a payment that starts
 * in the app comes back to it (Safepay returns to the website's /payment/return page).
 */
export const IN_APP_HOSTS = ['getsafepay.com', '*.getsafepay.com'];

export interface AppUrl {
  /** The address the app opens, with no trailing slash. */
  url: string;
  /** Its host, which also opens inside the app. */
  hostname: string;
  /** True while NURAY_APP_URL is not set. */
  placeholder: boolean;
}

export function resolveAppUrl(env: Record<string, string | undefined>): AppUrl {
  const raw = env.NURAY_APP_URL?.trim();
  if (!raw) return { url: PLACEHOLDER_URL, hostname: new URL(PLACEHOLDER_URL).hostname, placeholder: true };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`NURAY_APP_URL is not an address: ${raw}`);
  }
  // A store app may only load its website over HTTPS; plain http is for a phone on the same network as a dev machine.
  const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error(`NURAY_APP_URL must be https (http only for a local address): ${raw}`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`NURAY_APP_URL must be the site's address alone, without a path: ${raw}`);
  }
  return { url: parsed.origin, hostname: parsed.hostname, placeholder: false };
}

/** A release build must open the real website. */
export function assertReleasable(app: AppUrl): void {
  if (app.placeholder) throw new Error('NURAY_APP_URL is not set: a release build would open a placeholder address.');
  if (!app.url.startsWith('https://')) throw new Error('A release build must open an https address.');
}
