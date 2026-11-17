/**
 * An order booked for a later delivery window gets no rider job when the kitchen accepts it: the job is posted by the
 * one-minute sweep once the kitchen's start on it has come (its lead time before the window opens, Pakistan time).
 */
const db = {
  order: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  delivery: { findUnique: jest.fn(), create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/dispatch.service', () => ({ dispatchSoon: jest.fn(), postDeliverySoon: jest.fn() }));

import riderService from '../src/services/rider.service';
import { postDeliverySoon } from '../src/services/dispatch.service';
import { pktDate, addDays } from '../src/utils/payoutWeek';

const today = pktDate(new Date());
const slotDay = (daysAhead: number) => new Date(addDays(today, daysAhead));

function order(deliverySlotDate: Date | null) {
  return {
    id: 'order-1',
    deliveryType: 'home_delivery',
    deliveryProvider: 'platform',
    orderStatus: 'preparing',
    deliverySlotDate,
    deliverySlotTime: null,
    items: [{ status: 'preparing', fulfillmentType: 'seller', seller: { businessName: 'Kitchen', latitude: 31.5, longitude: 74.3, deliveryProvider: 'platform' } }],
    deliveryAddress: { addressLine1: 'House 1', area: 'Askari 11', city: 'Lahore', latitude: 31.4, longitude: 74.4 },
    deliveryAddressSnapshot: null,
  };
}

beforeEach(() => {
  db.order.findUnique.mockReset();
  db.order.findMany.mockReset().mockResolvedValue([]);
  db.order.updateMany.mockReset().mockResolvedValue({ count: 0 });
  db.delivery.findUnique.mockReset().mockResolvedValue(null);
  db.delivery.create.mockReset().mockResolvedValue({ id: 'delivery-1' });
  db.$queryRaw.mockReset().mockResolvedValue([{ order_status: 'preparing' }]);
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  (postDeliverySoon as jest.Mock).mockReset();
});

describe('ensureDeliveryForOrder and the delivery day', () => {
  it('posts no rider job for an order booked for a later day', async () => {
    db.order.findUnique.mockResolvedValue(order(slotDay(1)));
    await riderService.ensureDeliveryForOrder('order-1', 20);
    expect(db.delivery.create).not.toHaveBeenCalled();
    expect(postDeliverySoon).not.toHaveBeenCalled();
  });

  it.each([
    ['today', slotDay(0)],
    ['a day already past', slotDay(-1)],
    ['no day', null],
  ])('posts the rider job at once for an order booked for %s', async (_label, date) => {
    db.order.findUnique.mockResolvedValue(order(date));
    await riderService.ensureDeliveryForOrder('order-1', 20);
    expect(db.delivery.create).toHaveBeenCalledTimes(1);
    expect(postDeliverySoon).toHaveBeenCalledWith('delivery-1', 'order-1');
  });
});

describe('createDueDeliveries', () => {
  // 00:10 on 10 November in Pakistan.
  const now = new Date('2026-11-09T19:10:00Z');

  it('looks for accepted platform orders whose day has come and that have no rider job', async () => {
    await riderService.createDueDeliveries(now);
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({
      deliveryType: 'home_delivery',
      deliveryProvider: 'platform',
      orderStatus: { in: ['preparing', 'ready'] },
      deliverySlotDate: { lte: new Date('2026-11-10T00:00:00Z') },
      delivery: { is: null },
    });
  });

  it('posts the job for each one, and one failure does not stop the rest', async () => {
    db.order.findMany.mockResolvedValue([
      { id: 'order-a', orderStatus: 'preparing', deliverySlotDate: new Date('2026-11-10T00:00:00Z'), deliverySlotTime: null, items: [] },
      { id: 'order-b', orderStatus: 'ready', deliverySlotDate: new Date('2026-11-09T00:00:00Z'), deliverySlotTime: 'evening', items: [] },
    ]);
    db.order.findUnique.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ ...order(slotDay(0)), id: 'order-b' });
    expect(await riderService.createDueDeliveries(now)).toBe(2);
    expect(db.delivery.create).toHaveBeenCalledTimes(1);
    expect(db.delivery.create.mock.calls[0][0].data.orderId).toBe('order-b');
  });

  it('leaves an order whose window is later today until the kitchen starts on it', async () => {
    // 00:10 on the 10th: the evening window opens at 17:00, and this kitchen starts 90 minutes before.
    const evening = { id: 'order-c', orderStatus: 'preparing', deliverySlotDate: new Date('2026-11-10T00:00:00Z'), deliverySlotTime: 'evening', items: [{ seller: { preOrderLeadMinutes: 90 } }] };
    db.order.findMany.mockResolvedValue([evening]);
    expect(await riderService.createDueDeliveries(now)).toBe(0);
    expect(db.order.findUnique).not.toHaveBeenCalled();

    db.order.findUnique.mockResolvedValue({ ...order(slotDay(-1)), id: 'order-c' });
    // 15:30 on the 10th in Pakistan.
    expect(await riderService.createDueDeliveries(new Date('2026-11-10T10:30:00Z'))).toBe(1);
    expect(db.delivery.create).toHaveBeenCalledTimes(1);
  });
});
