import type { Request, Response } from 'express';
import { toAppError, errorHandler, AppError } from '../src/middleware/errorHandler';

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

  it('tells a client to come back in a moment when the database was too busy, with the standard header', () => {
    const res = send(prismaError('P2028'));
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '2');
    expect(res.json.mock.calls[0][0].error.code).toBe('SERVICE_BUSY');
  });

  it('does not ask for a retry on other errors', () => {
    const res = send(new AppError('nope', 409, 'CONFLICT'));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
