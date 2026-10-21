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

/**
 * Browser security headers. The Content-Security-Policy is not here: proxy.ts sends it, report-only until
 * CSP_ENFORCE=true in the server's environment (lib/csp.ts), so enforcing it needs a restart, not a new build.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
];

const nextConfig: NextConfig = {
  // One definite true or false for the one-click demo accounts. A NEXT_PUBLIC_* variable that is not set is not replaced in the
  // code, so testing NEXT_PUBLIC_ENABLE_DEMO_LOGIN there directly would leave the demo accounts in every build. They are on in
  // development, and in a production build only when that variable is "true".
  env: {
    NEXT_PUBLIC_DEMO_LOGIN:
      process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' ? 'true' : 'false',
  },
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
