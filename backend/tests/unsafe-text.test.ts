/**
 * Text no database column can hold (a NUL byte, an unpaired surrogate) is refused at the door with a 400, wherever it
 * comes in: the path, the query string, a JSON body, an uploaded file's name. Before, it reached Prisma, failed there as
 * a 500, and took the well-formed look-ups Prisma had batched with it down too.
 */
import type { NextFunction, Request, Response } from 'express';
import { hasUnsafeText, rejectUnsafeText } from '../src/middleware/unsafeText';
import { toAppError, AppError } from '../src/middleware/errorHandler';

const run = (req: Partial<Request>) => {
  const next = jest.fn() as unknown as NextFunction;
  let thrown: unknown;
  try {
    rejectUnsafeText({ originalUrl: '/api/v1/x', query: {}, body: undefined, ...req } as Request, {} as Response, next);
  } catch (e) {
    thrown = e;
  }
  return { next: next as unknown as jest.Mock, thrown: thrown as AppError | undefined };
};

describe('hasUnsafeText', () => {
  it('finds a NUL byte and unpaired surrogates', () => {
    expect(hasUnsafeText('a\u0000b')).toBe(true);
    expect(hasUnsafeText('\ud800x')).toBe(true); // a high surrogate with nothing after it
    expect(hasUnsafeText('x\udc00')).toBe(true); // a low surrogate with nothing before it
    expect(hasUnsafeText('\ud800\ud800')).toBe(true);
  });

  it('lets ordinary text through: accents, Urdu, emoji (a surrogate pair), newlines', () => {
    for (const ok of ['', 'biryani', 'café', 'تندوری اور گرل', 'thumbs 👍 up', 'line\nbreak\ttab', '😀😀']) expect(hasUnsafeText(ok)).toBe(false);
  });

  it('looks inside objects and arrays, including their keys, at any depth', () => {
    expect(hasUnsafeText({ a: [{ b: { c: 'x\u0000' } }] })).toBe(true);
    expect(hasUnsafeText({ ['k\u0000']: 1 })).toBe(true);
    expect(hasUnsafeText({ a: [1, 2, { b: 'fine' }], n: null, t: true })).toBe(false);
    let deep: unknown = ['\u0000'];
    for (let i = 0; i < 100_000; i++) deep = [deep]; // would overflow the stack of a recursive walk
    expect(hasUnsafeText(deep)).toBe(true);
  });
});

describe('rejectUnsafeText', () => {
  it('answers 400 INVALID_CHARACTERS for a %00 in the path, in either case of the encoding', () => {
    for (const url of ['/api/v1/categories/%00', '/api/v1/products/a%00b', '/api/v1/products?search=%00']) {
      const { thrown, next } = run({ originalUrl: url });
      expect([thrown?.statusCode, thrown?.code]).toEqual([400, 'INVALID_CHARACTERS']);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('answers 400 for unsafe text in the query string or in a JSON body', () => {
    expect(run({ query: { search: 'a\u0000' } as never }).thrown?.code).toBe('INVALID_CHARACTERS');
    expect(run({ body: { token: '\ud800x' } }).thrown?.code).toBe('INVALID_CHARACTERS');
    expect(run({ body: { items: [{ note: 'ok' }, { note: 'bad\u0000' }] } }).thrown?.statusCode).toBe(400);
  });

  it('answers 400 for an uploaded file whose name carries a NUL byte', () => {
    const file = (originalname: string) => ({ originalname, fieldname: 'images' });
    expect(run({ files: [file('ok.png'), file('bad\u0000.png')] as never }).thrown?.code).toBe('INVALID_CHARACTERS');
    expect(run({ file: file('bad\u0000.png') as never }).thrown?.code).toBe('INVALID_CHARACTERS');
    expect(run({ files: { images: [file('bad\u0000.png')] } as never }).thrown?.code).toBe('INVALID_CHARACTERS');
  });

  it('passes a clean request on', () => {
    const { thrown, next } = run({ originalUrl: '/api/v1/products?search=biryani%20rice', query: { search: 'biryani rice' } as never, body: { name: 'Karahi 🍲' }, files: [{ originalname: 'dish.jpg', fieldname: 'images' }] as never });
    expect(thrown).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('the database refusing such text', () => {
  it('is a 400, not a 500, if it ever gets that far', () => {
    const pg = new Error('Invalid `prisma.product.findFirst()` invocation: PostgresError { code: "22021", message: "invalid byte sequence for encoding \\"UTF8\\": 0x00" }');
    const e = toAppError(pg) as AppError;
    expect([e.statusCode, e.code]).toEqual([400, 'INVALID_CHARACTERS']);
    expect((toAppError(new Error('unexpected end of hex escape at line 1')) as AppError).statusCode).toBe(400);
    // other database faults stay what they were
    expect(toAppError(new Error('connection refused')) instanceof AppError).toBe(false);
  });
});
