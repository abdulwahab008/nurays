import * as Sentry from '@sentry/node';
import { runtimeMode } from './env';
import { requestContext } from '../utils/logger';

/**
 * Error tracking with Sentry (or any Sentry-compatible service, e.g. GlitchTip), on only when
 * SENTRY_DSN is set. Unexpected errors (500s, crashes, unhandled rejections) are reported with
 * the request id and user id; client errors (4xx) are not. Request bodies, cookies and
 * authorization headers are never sent.
 */

let enabled = false;

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'idempotency-key'];

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || runtimeMode(),
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    // Nothing about the person or their request beyond method and path: no bodies (passwords,
    // codes, addresses), cookies, headers (tokens) or query strings.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          for (const name of Object.keys(event.request.headers)) {
            if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete event.request.headers[name];
          }
        }
      }
      return event;
    },
  });
  enabled = true;
  return true;
}

/** Report an unexpected error, tagged with the current request's id and user. */
export function reportError(err: unknown, extra: Record<string, unknown> = {}) {
  if (!enabled) return;
  const ctx = requestContext.getStore();
  Sentry.withScope((scope) => {
    if (ctx?.requestId) scope.setTag('requestId', ctx.requestId);
    if (ctx?.userId) scope.setUser({ id: ctx.userId });
    for (const [key, value] of Object.entries(extra)) scope.setExtra(key, value);
    Sentry.captureException(err);
  });
}

/** Send pending reports before the process exits. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs).catch(() => undefined);
}
