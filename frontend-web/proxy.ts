import { NextResponse, type NextRequest } from 'next/server';
import { cspHeaderName, cspValue } from './lib/csp';

// Read once per server start: CSP_ENFORCE comes from the server's environment, not the build.
const HEADER = cspHeaderName(process.env.CSP_ENFORCE);
const ORIGINS = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
};
const DEV = process.env.NODE_ENV === 'development';

/**
 * Adds the Content-Security-Policy to every page (lib/csp.ts), with a nonce made for this request. Next.js reads the
 * nonce from the request's policy header and puts it on its own scripts; the root layout reads `x-nonce` for the one
 * inline script it writes. The other security headers are in next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = cspValue(ORIGINS, nonce, DEV);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(HEADER, policy);
  return response;
}

export const config = {
  // Pages and API routes; not the build's static files, images or other files with an extension, nor link prefetches.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
