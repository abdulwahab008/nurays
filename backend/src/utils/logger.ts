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

export const logger = pino({
  level: process.env.LOG_LEVEL || (runtimeMode() === 'test' ? 'warn' : 'info'),
  base: { service: 'nuray-api' },
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId, ...(ctx.userId ? { userId: ctx.userId } : {}) } : {};
  },
  // Never let credentials reach the logs, whatever a caller passes in.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.otpCode',
      '*.otpCodeOrPassword',
      '*.token',
      '*.refreshToken',
      '*.handoverCode',
    ],
    censor: '[redacted]',
  },
  transport: prettyTransport(),
});

/** Record the signed-in user on the current request's log context. */
export function setLogUser(userId: string) {
  const ctx = requestContext.getStore();
  if (ctx) ctx.userId = userId;
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
