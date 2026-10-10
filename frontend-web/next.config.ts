import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
  : 'http://localhost:3001';

/**
 * A build that says the legal texts were reviewed (NEXT_PUBLIC_LEGAL_REVIEWED=true) must also carry the
 * company's details. Otherwise the Terms, Privacy and Refund pages would go live showing "[Company legal name]"
 * with their draft notice removed.
 */
function assertLegalDetails() {
  if (process.env.NEXT_PUBLIC_LEGAL_REVIEWED !== 'true') return;
  const missing = ['NEXT_PUBLIC_LEGAL_COMPANY_NAME', 'NEXT_PUBLIC_LEGAL_ADDRESS', 'NEXT_PUBLIC_SUPPORT_EMAIL'].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `NEXT_PUBLIC_LEGAL_REVIEWED is true, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set: ` +
        'the legal pages would show bracketed placeholders without their draft notice.'
    );
  }
}
assertLegalDetails();

/** Origins the browser may talk to from this site (the API, its realtime server, sign-in and error reporting). */
function connectSources(): string {
  const out = new Set<string>(["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com', 'https://www.googleapis.com']);
  for (const raw of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_WS_URL, process.env.NEXT_PUBLIC_SENTRY_DSN]) {
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
 * Build-time switch: with CSP_ENFORCE=true the policy below is enforced; otherwise it is report-only.
 * It is baked into the build like every NEXT_PUBLIC_* value (Docker: the CSP_ENFORCE build arg).
 */
const ENFORCE_CSP = process.env.CSP_ENFORCE === 'true';

/**
 * Browser security headers. The Content-Security-Policy is sent report-only first: the browser reports
 * a violation to /api/csp-report (one log line each, see app/api/csp-report) instead of blocking, so a
 * missed origin (a new tile server, a payment page) is found before the policy is enforced. Enforce it
 * (CSP_ENFORCE=true at build time) after a week of clean reports on staging or the soft launch.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
  {
    key: ENFORCE_CSP ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      `connect-src ${connectSources()}`,
      "frame-src https://accounts.google.com https://getsafepay.com https://*.getsafepay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'report-uri /api/csp-report',
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // The framework's name is nobody's business.
  poweredByHeader: false,
  // Emit a self-contained server bundle for the Docker runtime image.
  // Without this, `next start` needs the full node_modules at runtime.
  output: "standalone",
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
      // Uploaded media (local storage driver) and short-lived signed links to private files.
      {
        source: '/media/:path*',
        destination: `${BACKEND_URL}/media/:path*`,
      },
      {
        source: '/files/:path*',
        destination: `${BACKEND_URL}/files/:path*`,
      },
    ];
  },
};

export default nextConfig;
