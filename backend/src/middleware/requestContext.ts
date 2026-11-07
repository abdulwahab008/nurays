import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger, requestContext } from '../utils/logger';
import { ERROR_LOGGED } from './errorHandler';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 2000;
const tookMs = (req: unknown) => Date.now() - ((req as { startedAt?: number }).startedAt ?? Date.now());
// A proxy's id (a UUID, nginx's 32-hex $request_id) passes; short or odd client-chosen strings get a fresh id.
const VALID_ID = /^[A-Za-z0-9_-]{16,64}$/;
// Query values that open something (signed file links, Safepay tracker/sig, tokens) or identify a person.
const SECRET_QUERY_KEY = /sig|token|secret|password|otp|code|tracker|key|phone|email/i;

/** The path with the query's keys kept and the values of sensitive ones replaced. */
export function safeUrl(url: string): string {
  const at = url.indexOf('?');
  if (at === -1) return url;
  const query = [...new URLSearchParams(url.slice(at + 1))]
    .map(([key, value]) => `${key}=${SECRET_QUERY_KEY.test(key) ? '[redacted]' : value}`)
    .join('&');
  return query ? `${url.slice(0, at)}?${query}` : url.slice(0, at);
}

const errorLogged = (res: object) => (res as Partial<Response>).locals?.[ERROR_LOGGED] === true;

/**
 * Gives every request an id (the caller's X-Request-Id when it looks sane, e.g. from a proxy,
 * otherwise a new one), returns it in the X-Request-Id header, and runs the rest of the
 * request inside a log context carrying it.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string; startedAt: number }).id = id;
  (req as Request & { startedAt: number }).startedAt = Date.now();
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) }, () => next());
}

/** One log line per request: method, path, status and duration. Health checks are skipped. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id?: string }).id ?? randomUUID(),
  autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
  // A 5xx the error handler logged at error level is a warn here, so each failure counts once in error alerts.
  // A request slower than SLOW_REQUEST_MS (default 2 s) is logged as a warning so it can be alerted on.
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return errorLogged(res) ? 'warn' : 'error';
    return res.statusCode >= 400 || tookMs(req) > SLOW_MS ? 'warn' : 'info';
  },
  customErrorObject: (_req, res, _err, val: Record<string, unknown>) => {
    if (!errorLogged(res)) return val;
    const { err: _dropped, ...rest } = val;
    return rest;
  },
  customProps: (req) => ({ slow: tookMs(req) > SLOW_MS || undefined }),
  serializers: {
    req: (req) => ({ method: req.method, url: safeUrl(req.url ?? '') }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  // No reqId binding: the log context already puts requestId on every line, so one field name remains.
  quietReqLogger: false,
});
