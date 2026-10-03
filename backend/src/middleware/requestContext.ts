import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger, requestContext } from '../utils/logger';

const VALID_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Gives every request an id (the caller's X-Request-Id when it looks sane, e.g. from a proxy,
 * otherwise a new one), returns it in the X-Request-Id header, and runs the rest of the
 * request inside a log context carrying it.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id }, () => next());
}

/** One log line per request: method, path, status and duration. Health checks are skipped. */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id?: string }).id ?? randomUUID(),
  autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  // The request id is already on every line via the log context.
  quietReqLogger: true,
});
