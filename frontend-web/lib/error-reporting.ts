/**
 * Browser error tracking with Sentry (or a Sentry-compatible service), on only when
 * NEXT_PUBLIC_SENTRY_DSN is set at build time. The SDK is loaded lazily, so a build without a
 * DSN ships none of it. Form contents, cookies and request bodies are never sent.
 */

type SentryModule = typeof import('@sentry/browser');

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
let loading: Promise<SentryModule | null> | null = null;

function sentry(): Promise<SentryModule | null> {
  if (!DSN || typeof window === 'undefined') return Promise.resolve(null);
  if (!loading) {
    loading = import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
          release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
          tracesSampleRate: 0,
          dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
          // Third-party scripts and browser extensions are not ours to fix.
          denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
        });
        return Sentry;
      })
      .catch(() => null);
  }
  return loading;
}

/** Start error tracking (installs the global error and unhandled-rejection handlers). */
export function initErrorReporting() {
  void sentry();
}

/** Report an error caught by an error boundary or a try/catch that can't recover. */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  void sentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) scope.setExtra(key, value);
      Sentry.captureException(error);
    });
  });
}
