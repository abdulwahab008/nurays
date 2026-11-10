/**
 * The unique constraint a P2002 hit, which the order-number retry, the checkout double-submit and the dish slug retry test.
 * Prisma 7 names it in the driver adapter's cause, older clients in meta.target.
 */
import { sqlState, uniqueTarget } from '../src/utils/thrown';

const prisma7 = (index: string) => ({ code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { index } } }, modelName: 'Order' } });

it('names the constraint from Prisma 7 and from older clients', () => {
  expect(uniqueTarget(prisma7('orders_order_number_key'))).toMatch(/order_?number/i);
  expect(uniqueTarget(prisma7('orders_customer_id_idempotency_key_key'))).toMatch(/idempotency/i);
  expect(uniqueTarget(prisma7('products_slug_key'))).toMatch(/slug/i);
  expect(uniqueTarget({ code: 'P2002', meta: { target: ['customer_id', 'idempotency_key'] } })).toMatch(/idempotency/i);
  expect(uniqueTarget({ code: 'P2002', meta: { target: 'orders_order_number_key' } })).toMatch(/order_?number/i);
});

it('reads nothing from a value that carries no constraint', () => {
  expect(uniqueTarget(new Error('x'))).toBe('');
  expect(uniqueTarget(null)).toBe('');
});

it('reads the SQLSTATE behind a Prisma 7 error', () => {
  expect(sqlState({ meta: { driverAdapterError: { cause: { originalCode: '57014', code: '57014' } } } })).toBe('57014');
  expect(sqlState({ meta: { code: '57014' } })).toBeUndefined();
});
