import { AsyncLocalStorage } from 'async_hooks';
import { format } from 'util';
import pino from 'pino';
import { runtimeMode } from '../config/env';

/**
 * Structured logs: one JSON object per line in production (for any log collector), readable
 * lines in development. Every line written while handling a request carries that request's
 * id (and the signed-in user's id once known), so all logs of one request can be found
 * from the id returned to the client in the X-Request-Id header and in error responses.
 */

export interface RequestContext {
  requestId: string;
  userId?: string;
  /** Where the request came from, for the list of signed-in devices. */
  ip?: string;
  userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function prettyTransport() {
  if (runtimeMode() !== 'development' || process.env.LOG_FORMAT === 'json') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } };
  } catch {
    return undefined;
  }
}

const SECRET_KEYS = new Set(
  [
    'password',
    'newPassword',
    'currentPassword',
    'token',
    'accessToken',
    'refreshToken',
    'access_token',
    'refresh_token',
    'authorization',
    'cookie',
    'otp',
    'otpCode',
    'otpCodeOrPassword',
    'deliveryOtp',
    'handoverCode',
    'code',
    'sig',
    'signature',
    'secret',
    'cardNumber',
    'cvv',
  ].map((key) => key.toLowerCase())
);
const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

/**
 * Pino's redact paths have no recursive wildcard ('*.key' is exactly one level) and each wildcard path
 * costs about 1 µs per line, so secret keys are scrubbed here at any depth instead, copying only the
 * branches that change. Errors are left to pino's error serializer (their `code` is an error code).
 */
function scrubSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let out: unknown[] | undefined;
    value.forEach((item, i) => {
      const clean = scrubSecrets(item, depth + 1);
      if (clean !== item) (out ??= value.slice())[i] = clean;
    });
    return out ?? value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  let out: Record<string, unknown> | undefined;
  for (const [key, item] of Object.entries(value)) {
    const clean = SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : scrubSecrets(item, depth + 1);
    if (clean !== item) (out ??= { ...value })[key] = clean;
  }
  return out ?? value;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (runtimeMode() === 'test' ? 'warn' : 'info'),
  base: { service: 'nuray-api' },
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId, ...(ctx.userId ? { userId: ctx.userId } : {}) } : {};
  },
  // Never let credentials reach the logs, whatever a caller passes in.
  formatters: { log: (obj) => scrubSecrets(obj) as Record<string, unknown> },
  // An HTTP client's error carries the request it sent, headers included.
  redact: { paths: ['err.config.headers.authorization', 'err.response.config.headers.authorization'], censor: REDACTED },
  transport: prettyTransport(),
});

/** Record the signed-in user on the current request's log context. */
export function setLogUser(userId: string) {
  const ctx = requestContext.getStore();
  if (ctx) ctx.userId = userId;
}

/** Log a structured domain event (e.g. logEvent('order.placed', { orderId })) at info, tagged with the current request id. */
export function logEvent(name: string, fields: Record<string, unknown> = {}) {
  logger.info({ ...fields, event: name }, name);
}

/**
 * Send console.* through the logger, so the many existing console calls become structured
 * lines with level, time and request id. Called once by the server at startup (not in tests
 * or scripts, which keep the plain console).
 */
export function routeConsoleToLogger() {
  const text = (args: unknown[]) => format(...args);
  const withError = (args: unknown[]) => {
    const err = args.find((a) => a instanceof Error);
    return err ? { err } : {};
  };
  console.log = (...args: unknown[]) => logger.info(text(args));
  console.info = (...args: unknown[]) => logger.info(text(args));
  console.debug = (...args: unknown[]) => logger.debug(text(args));
  console.warn = (...args: unknown[]) => logger.warn(withError(args), text(args));
  console.error = (...args: unknown[]) => logger.error(withError(args), text(args));
}
