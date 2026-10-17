/**
 * What a person filling in a form is told when it is wrong. zod's own wording ("Too small: expected string to have
 * >=10 characters") named no field and meant nothing to them; now each problem is a sentence about the field. Real zod
 * errors go through the real middleware, so the wording is checked against what zod actually reports.
 */
import { z } from 'zod';
import { validate, validateQuery } from '../src/middleware/validation.middleware';
import { fieldLabel } from '../src/utils/validationMessages';
import type { AppError } from '../src/middleware/errorHandler';

const run = (schema: z.ZodType, body: unknown): AppError => {
  const next = jest.fn();
  try {
    validate(schema)({ body } as never, {} as never, next);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('the schema accepted the body');
};
const texts = (e: AppError) => (e.details as Array<{ field: string; message: string }>).map((d) => d.message);

describe('fieldLabel', () => {
  it('turns a field name into words and skips list positions', () => {
    expect(fieldLabel(['fullName'])).toBe('Full name');
    expect(fieldLabel(['phone_otp'])).toBe('Phone otp');
    expect(fieldLabel(['items', 2, 'quantity'])).toBe('Quantity');
    expect(fieldLabel(['businessName'])).toBe('Business name');
    expect(fieldLabel([])).toBe('This');
    expect(fieldLabel([0])).toBe('This');
  });
});

describe('validation messages', () => {
  const form = z.object({
    message: z.string().min(10),
    fullName: z.string().min(2),
    phone: z.string().regex(/^\d+$/),
    email: z.string().email(),
    quantity: z.number().int().min(1).max(50),
    rating: z.number().min(1),
    items: z.array(z.string()).min(1),
    tags: z.array(z.string()).max(2),
    status: z.enum(['open', 'closed']),
    note: z.string().max(5),
    when: z.string().datetime(),
    id: z.string().uuid(),
    own: z.string().email('Invalid email format'),
    checked: z.boolean(),
    count: z.number(),
  });

  it('says what each field needs, in words', () => {
    const e = run(form, {
      message: 'short', fullName: '', phone: 'abc', email: 'nope', quantity: 0, rating: 0.5, items: [], tags: ['a', 'b', 'c'],
      status: 'maybe', note: 'too long for this', when: 'yesterday', id: 'x', own: 'nope', checked: 'yes', count: 'many',
    });
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.statusCode).toBe(400);
    expect(texts(e)).toEqual([
      'Message must be at least 10 characters',
      'Full name must be at least 2 characters',
      'Phone is not in the right format',
      'Email must be a valid email address',
      'Quantity must be 1 or more',
      'Rating must be 1 or more',
      'Items needs at least 1 item',
      'Tags can have at most 2 items',
      'Status must be one of: open, closed',
      'Note must be at most 5 characters',
      'When must be a valid date and time',
      'Id is not valid',
      'Invalid email format', // the schema's own message is kept
      'Checked must be true or false',
      'Count must be a number',
    ]);
  });

  it('keeps the "Validation failed:" prefix and the field names that callers read', () => {
    const e = run(z.object({ message: z.string().min(10) }), { message: 'short' });
    expect(e.message).toBe('Validation failed: Message must be at least 10 characters');
    expect(e.details).toEqual([{ field: 'message', message: 'Message must be at least 10 characters' }]);
  });

  it('says "is required" for a field that is missing, and "at most" for a number over its limit', () => {
    const e = run(z.object({ name: z.string(), age: z.number().max(120) }), { age: 200 });
    expect(texts(e)).toEqual(['Name is required', 'Age must be 120 or less']);
  });

  it('names an unexpected field, and a nested one by its own name', () => {
    expect(texts(run(z.object({ a: z.string() }).strict(), { a: 'x', b: 1, c: 2 }))).toEqual(['Unexpected fields: b, c']);
    expect(texts(run(z.object({ address: z.object({ postalCode: z.string().min(5) }) }), { address: { postalCode: '1' } }))).toEqual(['Postal code must be at least 5 characters']);
    expect(texts(run(z.object({ lines: z.array(z.object({ qty: z.number().min(1) })) }), { lines: [{ qty: 1 }, { qty: 0 }] }))).toEqual(['Qty must be 1 or more']);
  });

  it('does the same for a query string', () => {
    const next = jest.fn();
    let err: AppError | undefined;
    try {
      validateQuery(z.object({ limit: z.coerce.number().max(100) }))({ query: { limit: '500' } } as never, {} as never, next);
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.message).toBe('Query validation failed');
    expect(err?.details).toEqual([{ field: 'limit', message: 'Limit must be 100 or less' }]);
  });
});
