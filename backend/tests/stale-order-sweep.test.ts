/**
 * Which orders the stale-order sweep cancels for not being accepted in time. The kitchen's 30 minutes start when it could
 * first accept: at placement, or for an online checkout when it is paid. An unpaid online checkout is left to the payment rule.
 * An order booked for a delivery window is not timed before the kitchen starts on it (its lead time before the window opens).
 * A transfer to the kitchen can only be paid once the kitchen has accepted, so its hour to pay starts then.
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
    if (field === 'AND') return (cond as Filter[]).every((w) => matches(row, w));
    if (field === 'statusHistory') {
      const { none } = cond as { none: Filter };
      return !((row.statusHistory as Row[] | undefined) ?? []).some((h) => matches(h, none));
    }
    const value = row[field];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return value === cond;
    const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown; lt?: Date; lte?: Date; gte?: Date };
    if (c.in && !c.in.includes(value)) return false;
    if (c.notIn && c.notIn.includes(value)) return false;
    if ('not' in c && value === c.not) return false;
    if (c.lt && !(value instanceof Date && value < c.lt)) return false;
    if (c.lte && !(value instanceof Date && value <= c.lte)) return false;
    if (c.gte && !(value instanceof Date && value >= c.gte)) return false;
    return true;
  });
}

const now = new Date('2026-11-09T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const order = (id: string, o: Row): Row => ({ id, orderStatus: 'pending', paymentStatus: 'pending', paidAt: null, deliverySlotDate: null, deliverySlotTime: null, items: [], ...o });

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

describe('an order booked for a later day', () => {
  // 00:20 on 10 November in Pakistan.
  const justAfterMidnight = new Date('2026-11-09T19:20:00Z');
  const before = (at: Date, min: number) => new Date(at.getTime() - min * 60_000);
  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  const sweep = async (at: Date, rows: Row[]) => {
    (adminOrderService.cancelOrder as jest.Mock).mockReset();
    db.order = { findMany: jest.fn(async ({ where }: { where: Filter }) => rows.filter((o) => matches(o, where))) };
    await sweepStaleOrders(at);
    return (adminOrderService.cancelOrder as jest.Mock).mock.calls.map(([id]) => id).sort();
  };

  it('is not cancelled for not being accepted before its day begins, whether cash or paid online', async () => {
    const cancelled = await sweep(now, [
      order('cod-tomorrow', { paymentMethod: 'cod', createdAt: ago(600), deliverySlotDate: day('2026-11-10') }),
      order('paid-in-3-days', { paymentMethod: 'safepay', paymentStatus: 'paid', createdAt: ago(600), paidAt: ago(590), deliverySlotDate: day('2026-11-12') }),
      order('cod-today', { paymentMethod: 'cod', createdAt: ago(35), deliverySlotDate: day('2026-11-09') }),
    ]);
    expect(cancelled).toEqual(['cod-today']);
  });

  it('gets the usual 30 minutes from the start of its day', async () => {
    const placed = before(justAfterMidnight, 600);
    expect(await sweep(justAfterMidnight, [order('cod-for-the-10th', { paymentMethod: 'cod', createdAt: placed, deliverySlotDate: day('2026-11-10') })])).toEqual([]);

    const tenMinutesLater = new Date(justAfterMidnight.getTime() + 10 * 60_000);
    expect(await sweep(tenMinutesLater, [order('cod-for-the-10th', { paymentMethod: 'cod', createdAt: placed, deliverySlotDate: day('2026-11-10') })])).toEqual(['cod-for-the-10th']);
  });

  it('booked for a window is not timed until the kitchen starts on it: its lead time before the window opens', async () => {
    const evening = (lead: number | null) =>
      order('cod-evening', { paymentMethod: 'cod', createdAt: ago(300), deliverySlotDate: day('2026-11-09'), deliverySlotTime: 'evening', items: [{ seller: { preOrderLeadMinutes: lead } }] });
    // The evening window opens at 17:00 in Pakistan (12:00 UTC). With the usual hour's lead the kitchen starts at 16:00.
    const at = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
    expect(await sweep(at('11:20'), [evening(null)])).toEqual([]);
    expect(await sweep(at('11:31'), [evening(null)])).toEqual(['cod-evening']);
    // A kitchen that starts three hours before has until 14:30.
    expect(await sweep(at('09:20'), [evening(180)])).toEqual([]);
    expect(await sweep(at('09:31'), [evening(180)])).toEqual(['cod-evening']);
  });

  it('is still cancelled when its online payment is never completed', async () => {
    const cancelled = await sweep(now, [order('unpaid-tomorrow', { paymentMethod: 'safepay', createdAt: ago(65), deliverySlotDate: day('2026-11-10') })]);
    expect(cancelled).toEqual(['unpaid-tomorrow']);
  });
});

describe('a transfer to the kitchen', () => {
  const sweep = async (rows: Row[]) => {
    db.order = { findMany: jest.fn(async ({ where }: { where: Filter }) => rows.filter((o) => matches(o, where))) };
    await sweepStaleOrders(now);
    return (adminOrderService.cancelOrder as jest.Mock).mock.calls.map(([id, , reason]) => [id, reason]);
  };
  const accepted = (minutesAgo: number) => [{ status: 'preparing', createdAt: ago(minutesAgo) }];

  it('has an hour to be paid from when the kitchen accepted, not from when it was placed', async () => {
    const cancelled = await sweep([
      order('accepted-late', { paymentMethod: 'bank', orderStatus: 'preparing', createdAt: ago(600), statusHistory: accepted(20) }),
      order('accepted-long-ago', { paymentMethod: 'jazzcash', orderStatus: 'preparing', createdAt: ago(600), statusHistory: accepted(65) }),
      order('reported', { paymentMethod: 'easypaisa', orderStatus: 'preparing', paymentStatus: 'payment_submitted', createdAt: ago(600), statusHistory: accepted(65) }),
    ]);
    expect(cancelled).toEqual([['accepted-long-ago', "The payment wasn't completed in time."]]);
  });

  it('is cancelled for not being accepted, never for not being paid, while the kitchen has not accepted', async () => {
    const booked = { deliverySlotDate: new Date('2026-11-10T00:00:00Z') };
    const cancelled = await sweep([
      order('waiting-65', { paymentMethod: 'bank', createdAt: ago(65) }),
      order('booked-for-tomorrow', { paymentMethod: 'bank', createdAt: ago(600), ...booked }),
    ]);
    expect(cancelled).toEqual([['waiting-65', "The kitchen didn't confirm the order in time."]]);
  });
});
