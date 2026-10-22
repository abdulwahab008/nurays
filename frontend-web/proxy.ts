import { NextResponse } from 'next/server';
import { cspHeaderName, cspValue } from './lib/csp';

// Built once per server start: CSP_ENFORCE is read from the server's environment, not baked into the build.
const HEADER = cspHeaderName(process.env.CSP_ENFORCE);
const VALUE = cspValue({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

/** Adds the Content-Security-Policy to every page (lib/csp.ts). The other security headers are in next.config.ts. */
export function proxy() {
  const response = NextResponse.next();
  response.headers.set(HEADER, VALUE);
  return response;
}

export const config = {
  // Pages and API routes; not the build's static files, images or other files with an extension.
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
