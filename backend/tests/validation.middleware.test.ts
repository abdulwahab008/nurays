/**
 * validateQuery used to call schema.parse(req.query) and discard the return
 * value, so any zod .transform() (e.g. "2" -> 2, "a,b" -> ["a","b"]) never
 * reached the controller — req.query stayed the raw, untransformed strings.
 * A naive fix (`req.query = ...`) breaks on Express 5, where req.query is a
 * getter-only accessor with no setter — this test reproduces that exact shape
 * without needing a real Express app.
 */
import { z } from 'zod';
import { validateQuery } from '../src/middleware/validation.middleware';

/** Mimics Express 5's req.query: an own getter with no setter, exactly like the real bug. */
function makeExpress5StyleRequest(rawQuery: Record<string, unknown>) {
  const req = {};
  Object.defineProperty(req, 'query', {
    get: () => rawQuery,
    configurable: true,
    enumerable: true,
    // no `set` — matches Express 5's getter-only req.query
  });
  return req as any;
}

const schema = z.object({
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  dietary: z.string().optional().transform((v) => (v ? v.split(',') : undefined)),
});

describe('validateQuery against a getter-only req.query (Express 5 shape)', () => {
  it('does not throw "Cannot set property query of ... which has only a getter"', () => {
    const req = makeExpress5StyleRequest({ dietary: 'Halal' });
    const next = jest.fn();
    expect(() => validateQuery(schema)(req, {} as any, next)).not.toThrow();
    expect(next).toHaveBeenCalledWith(); // called with no error argument
  });

  it('writes the transformed (not raw) values back to req.query', () => {
    const req = makeExpress5StyleRequest({ page: '2', dietary: 'Halal,Vegan' });
    const next = jest.fn();
    validateQuery(schema)(req, {} as any, next);
    expect(req.query.page).toBe(2);
    expect(req.query.dietary).toEqual(['Halal', 'Vegan']);
  });

  it('defaults correctly when the param is omitted', () => {
    const req = makeExpress5StyleRequest({});
    const next = jest.fn();
    validateQuery(schema)(req, {} as any, next);
    expect(req.query.page).toBe(1);
    expect(req.query.dietary).toBeUndefined();
  });

  it('still rejects invalid query values by throwing a validation AppError', () => {
    const strictSchema = z.object({ isActive: z.enum(['true', 'false']) });
    const req = makeExpress5StyleRequest({ isActive: 'maybe' });
    const next = jest.fn();
    expect(() => validateQuery(strictSchema)(req, {} as any, next)).toThrow(/[Vv]alidation/);
  });
});
