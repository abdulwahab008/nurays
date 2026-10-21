/**
 * The Content-Security-Policy (SEC-7). Sent by proxy.ts on every page, report-only until CSP_ENFORCE=true: that is
 * read when the server starts, so switching to enforcing after a clean week is a restart with one variable set, not
 * a new build (the CSP_ENFORCE build argument still sets the default in the Docker image). Violations go to
 * /api/csp-report either way. No imports, so a unit test can read it (tests/unit/csp.test.ts).
 */

export interface CspOrigins {
  apiUrl?: string;
  wsUrl?: string;
  sentryDsn?: string;
}

/** Origins the browser may talk to from this site (the API, its realtime server, sign-in and error reporting). */
export function connectSources(origins: CspOrigins): string {
  const out = new Set<string>(["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com', 'https://www.googleapis.com']);
  for (const raw of [origins.apiUrl, origins.wsUrl, origins.sentryDsn]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      out.add(u.origin);
      out.add(u.origin.replace(/^http/, 'ws'));
    } catch {
      /* not a URL (a relative API path): same origin, already covered */
    }
  }
  return Array.from(out).join(' ');
}

export function cspValue(origins: CspOrigins): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSources(origins)}`,
    "frame-src https://accounts.google.com https://getsafepay.com https://*.getsafepay.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

/** The header to send: enforcing only when the switch says exactly "true". */
export const cspHeaderName = (enforce: string | undefined): string =>
  enforce === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
