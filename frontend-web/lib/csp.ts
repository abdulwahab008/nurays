/**
 * The Content-Security-Policy (SEC-7). Sent by proxy.ts on every page with a new nonce each time, and enforced: a
 * script runs only when it comes from this site, carries the page's nonce, or was loaded by one that did
 * ('strict-dynamic', which is how Google's sign-in script arrives). An injected inline script or event handler is
 * refused. CSP_ENFORCE=false in the server's environment turns it back to report-only without a rebuild, for
 * finding what a change broke. Violations go to /api/csp-report either way. No imports, so a unit test can read it
 * (tests/unit/csp.test.ts).
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

/**
 * The policy for one page. `dev` adds 'unsafe-eval', which React needs in development only. Styles keep
 * 'unsafe-inline': the components set style attributes, which a nonce cannot cover, and a style cannot run code.
 */
export function cspValue(origins: CspOrigins, nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // Chat voice notes come from the storage service's signed links; audio cannot run code.
    "media-src 'self' data: blob: https:",
    // The push service worker (/sw.js): its own directive, so it does not fall back to script-src and 'strict-dynamic'.
    "worker-src 'self'",
    `connect-src ${connectSources(origins)}`,
    "frame-src https://accounts.google.com https://getsafepay.com https://*.getsafepay.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

/** The header to send: enforcing unless the switch says exactly "false". */
export const cspHeaderName = (enforce: string | undefined): string =>
  enforce === 'false' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
