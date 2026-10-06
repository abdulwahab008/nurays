import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger, requestContext } from '../utils/logger';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 2000;
const tookMs = (req: unknown) => Date.now() - ((req as { startedAt?: number }).startedAt ?? Date.now());
const VALID_ID = /^[A-Za-z0-9._:-]{1,100}$/;

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
  requestContext.run({ requestId: id }, () => next());
}

/** One log line per request: method, path, status and duration. Health checks are skipped. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id?: string }).id ?? randomUUID(),
  autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
  // A request slower than SLOW_REQUEST_MS (default 2 s) is logged as a warning so it can be alerted on.
  customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 || tookMs(req) > SLOW_MS ? 'warn' : 'info'),
  customProps: (req) => ({ slow: tookMs(req) > SLOW_MS || undefined }),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  // The request id is already on every line via the log context.
  quietReqLogger: true,
});
