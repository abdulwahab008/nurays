import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
  : 'http://localhost:3001';

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
 * Browser security headers. The Content-Security-Policy is sent report-only first: it is logged by
 * the browser instead of blocking, so a missed origin (a new tile server, a payment page) is found
 * in the console before the policy is enforced. Turn it into Content-Security-Policy once clean.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
  {
    key: 'Content-Security-Policy-Report-Only',
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
