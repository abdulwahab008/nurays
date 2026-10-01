import { toAppError, AppError } from '../src/middleware/errorHandler';

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
