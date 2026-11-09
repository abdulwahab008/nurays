/**
 * Which orders the stale-order sweep cancels for not being accepted in time. The kitchen's 30 minutes start when it could
 * first accept: at placement, or for an online checkout when it is paid. An unpaid online checkout is left to the payment rule.
 * The database is a double that applies the sweep's own filters to a few orders.
 */
const db: { order?: { findMany: jest.Mock } } = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/admin-order.service', () => ({ __esModule: true, default: { cancelOrder: jest.fn() } }));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn() }));

import adminOrderService from '../src/services/admin-order.service';
import { sweepStaleOrders } from '../src/services/order-maintenance.service';

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;

function matches(row: Row, where: Filter): boolean {
  return Object.entries(where).every(([field, cond]) => {
    if (field === 'OR') return (cond as Filter[]).some((w) => matches(row, w));
    const value = row[field];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return value === cond;
    const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown; lt?: Date };
    if (c.in && !c.in.includes(value)) return false;
    if (c.notIn && c.notIn.includes(value)) return false;
    if ('not' in c && value === c.not) return false;
    if (c.lt && !(value instanceof Date && value < c.lt)) return false;
    return true;
  });
}

const now = new Date('2026-11-09T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const order = (id: string, o: Row): Row => ({ id, orderStatus: 'pending', paymentStatus: 'pending', paidAt: null, ...o });

const orders = [
  order('cod-late', { paymentMethod: 'cod', createdAt: ago(35) }),
  order('cod-fresh', { paymentMethod: 'cod', createdAt: ago(20) }),
  order('bank-late', { paymentMethod: 'bank', paymentStatus: 'payment_submitted', createdAt: ago(35) }),
  order('paid-just-now', { paymentMethod: 'safepay', paymentStatus: 'paid', createdAt: ago(40), paidAt: ago(5) }),
  order('paid-long-ago', { paymentMethod: 'safepay', paymentStatus: 'paid', createdAt: ago(50), paidAt: ago(35) }),
  order('unpaid-online-45', { paymentMethod: 'safepay', createdAt: ago(45) }),
  order('unpaid-online-65', { paymentMethod: 'card', createdAt: ago(65) }),
];

beforeEach(() => {
  db.order = { findMany: jest.fn(async ({ where }: { where: Filter }) => orders.filter((o) => matches(o, where))) };
  (adminOrderService.cancelOrder as jest.Mock).mockReset();
});

it('gives the kitchen 30 minutes from when it could first accept, and leaves an unpaid checkout to the payment rule', async () => {
  const result = await sweepStaleOrders(now);
  const cancelled = (adminOrderService.cancelOrder as jest.Mock).mock.calls.map(([id, , reason]) => [id, reason]);

  expect(cancelled).toEqual(
    expect.arrayContaining([
      ['cod-late', "The kitchen didn't confirm the order in time."],
      ['bank-late', "The kitchen didn't confirm the order in time."],
      ['paid-long-ago', "The kitchen didn't confirm the order in time."],
      ['unpaid-online-65', "The payment wasn't completed in time."],
    ])
  );
  expect(cancelled.map(([id]) => id).sort()).toEqual(['bank-late', 'cod-late', 'paid-long-ago', 'unpaid-online-65']);
  expect(result).toMatchObject({ cancelledUnpaid: 1, cancelledUnaccepted: 3 });
});
