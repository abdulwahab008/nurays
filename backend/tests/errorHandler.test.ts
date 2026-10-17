import type { Request, Response } from 'express';
import { toAppError, errorHandler, AppError } from '../src/middleware/errorHandler';
import { logger } from '../src/utils/logger';
import { reportError } from '../src/config/sentry';

jest.mock('../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/config/sentry', () => ({ reportError: jest.fn() }));

const prismaError = (code: string) => Object.assign(new Error('db'), { code, clientVersion: '6.0.0' });

describe('toAppError', () => {
  it('maps a unique-constraint violation to 409', () => {
    const e = toAppError(prismaError('P2002')) as AppError;
    expect(e).toBeInstanceOf(AppError);
    expect([e.statusCode, e.code]).toEqual([409, 'DUPLICATE_RECORD']);
  });

  it('maps a missing record to 404 and a bad reference to 400', () => {
    expect((toAppError(prismaError('P2025')) as AppError).statusCode).toBe(404);
    expect((toAppError(prismaError('P2003')) as AppError).statusCode).toBe(400);
  });

  it('maps a database that was too busy to answer (no free connection, a transaction out of time) to 503', () => {
    for (const code of ['P2024', 'P2028']) {
      const e = toAppError(prismaError(code)) as AppError;
      expect(e).toBeInstanceOf(AppError);
      expect([e.statusCode, e.code]).toEqual([503, 'SERVICE_BUSY']);
    }
    // other Prisma errors stay what they were: a real fault is a 500
    expect(toAppError(prismaError('P2010')) instanceof AppError).toBe(false);
  });

  it('maps a write conflict or deadlock (the transaction was rolled back) to the same 503', () => {
    const e = toAppError(prismaError('P2034')) as AppError;
    expect(e).toBeInstanceOf(AppError);
    expect([e.statusCode, e.code]).toEqual([503, 'SERVICE_BUSY']);
  });

  it('maps a database that cannot be reached to 503, whether Prisma gave a code or only the kind of error', () => {
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017']) {
      const e = toAppError(prismaError(code)) as AppError;
      expect(e).toBeInstanceOf(AppError);
      expect([e.statusCode, e.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
    }
    const down = Object.assign(new Error("Can't reach database server at `localhost:5432`"), { name: 'PrismaClientInitializationError', clientVersion: '6.19.3' });
    const e = toAppError(down) as AppError;
    expect([e.statusCode, e.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
  });

  it('maps a statement PostgreSQL cancelled for running too long to the same 503, however Prisma reported it', () => {
    // a raw query: P2010, the SQLSTATE in meta
    const raw = Object.assign(new Error('Raw query failed. Code: `57014`. Message: `ERROR: canceling statement due to statement timeout`'), {
      code: 'P2010',
      clientVersion: '6.19.3',
      meta: { code: '57014', message: 'ERROR: canceling statement due to statement timeout' },
    });
    // any other query: no code, the SQLSTATE in the message
    const model = Object.assign(
      new Error(
        'Invalid `prisma.category.findMany()` invocation:\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "57014", message: "canceling statement due to statement timeout", severity: "ERROR" }), transient: false })'
      ),
      { clientVersion: '6.19.3' }
    );
    for (const err of [raw, model]) {
      const e = toAppError(err) as AppError;
      expect(e).toBeInstanceOf(AppError);
      expect([e.statusCode, e.code]).toEqual([503, 'SERVICE_BUSY']);
    }
    // another failed raw query is still a fault, and so is an error that is not Prisma's and merely names the number
    expect(toAppError(Object.assign(new Error('x'), { code: 'P2010', clientVersion: '6.19.3', meta: { code: '42P01' } })) instanceof AppError).toBe(false);
    expect(toAppError(new Error('PostgresError { code: "57014" }')) instanceof AppError).toBe(false);
  });

  it('maps oversized and malformed bodies', () => {
    expect((toAppError(Object.assign(new Error('x'), { type: 'entity.too.large' })) as AppError).statusCode).toBe(413);
    expect((toAppError(Object.assign(new Error('x'), { type: 'entity.parse.failed' })) as AppError).statusCode).toBe(400);
  });

  it('maps multer errors', () => {
    expect((toAppError(Object.assign(new Error('x'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' })) as AppError).statusCode).toBe(413);
  });

  it('leaves unknown errors and AppErrors untouched', () => {
    const plain = new Error('boom');
    expect(toAppError(plain)).toBe(plain);
    const app = new AppError('nope', 418, 'TEAPOT');
    expect(toAppError(app)).toBe(app);
    // an error that merely has a `code` but isn't from Prisma stays a 500
    expect(toAppError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBeInstanceOf(Error);
    expect(toAppError(Object.assign(new Error('x'), { code: 'ECONNRESET' })) instanceof AppError).toBe(false);
  });
});

describe('errorHandler', () => {
  const send = (err: Error) => {
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, { path: '/x', method: 'GET' } as Request, res as unknown as Response, jest.fn());
    return res;
  };

  it('keeps an outage an incident: it is logged as an error and reported, with Retry-After for the client', () => {
    const down = Object.assign(new Error("Can't reach database server"), { name: 'PrismaClientInitializationError', clientVersion: '6.19.3' });
    const res = send(down);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '2');
    expect(res.json.mock.calls[0][0].error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.json.mock.calls[0][0].error.message).not.toMatch(/localhost|database server/i);
    expect(reportError).toHaveBeenCalled();
  });

  it('tells a client to come back in a moment when the database was too busy, with the standard header', () => {
    const res = send(prismaError('P2028'));
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '2');
    expect(res.json.mock.calls[0][0].error.code).toBe('SERVICE_BUSY');
  });

  it('reports a 5xx as an incident, but not one the system gives on purpose in a known state', () => {
    send(new AppError('boom', 500, 'INTERNAL_ERROR'));
    send(new AppError('Google is down', 503, 'GOOGLE_UNAVAILABLE'));
    send(prismaError('P2028')); // a busy database is an incident too
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(reportError).toHaveBeenCalledTimes(3);

    jest.mocked(logger.error).mockClear();
    jest.mocked(reportError).mockClear();
    const res = send(AppError.expected('Online payment is not available right now', 503, 'GATEWAY_UNAVAILABLE'));
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].error.code).toBe('GATEWAY_UNAVAILABLE');
    expect(logger.error).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not ask for a retry on other errors', () => {
    const res = send(new AppError('nope', 409, 'CONFLICT'));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
