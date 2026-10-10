/**
 * A delivery job joining the open pool is offered to the best rider first. Riders hear that it is in
 * the pool only when nobody could take it, so an order that is assigned at once costs no rider a reload.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { order: { findUnique: jest.fn() } },
}));
jest.mock('../src/config/socket', () => ({
  __esModule: true,
  default: { emitToRole: jest.fn(), emitToRooms: jest.fn(), emitToUser: jest.fn() },
}));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifyMany: jest.fn() }));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import realtimeOrderService from '../src/services/realtime-order.service';
import { postDelivery } from '../src/services/dispatch.service';

const socket = socketManager as any;
const db = prisma as any;

/** The events sent to every rider, as [event, payload]. */
const toRiders = () => socket.emitToRole.mock.calls.filter((c: unknown[]) => c[0] === 'rider').map((c: unknown[]) => [c[1], c[2]]);

describe('postDelivery', () => {
  it('says nothing to the riders when a rider takes the job at once', async () => {
    const dispatch = jest.fn().mockResolvedValue({ assigned: true, riderId: 'r1' });
    await postDelivery('d1', 'o1', dispatch);
    expect(dispatch).toHaveBeenCalledWith('d1', { announced: false });
    expect(toRiders()).toEqual([]);
  });

  it('announces the job to every rider when nobody can take it', async () => {
    for (const reason of ['no_riders', 'no_eligible_rider', 'disabled', 'lost_race']) {
      socket.emitToRole.mockClear();
      await postDelivery('d1', 'o1', jest.fn().mockResolvedValue({ assigned: false, reason }));
      expect(toRiders()).toEqual([['delivery:new', { deliveryId: 'd1', orderId: 'o1' }]]);
    }
  });

  it('never leaves a job unannounced when the dispatcher fails', async () => {
    await expect(postDelivery('d1', 'o1', jest.fn().mockRejectedValue(new Error('database is down')))).resolves.toBeUndefined();
    expect(toRiders()).toEqual([['delivery:new', { deliveryId: 'd1', orderId: 'o1' }]]);
  });

  it('with automatic assignment switched off, every job goes to the pool at once', async () => {
    const before = process.env.AUTO_ASSIGN_ENABLED;
    process.env.AUTO_ASSIGN_ENABLED = 'false';
    try {
      await postDelivery('d1', 'o1');
    } finally {
      if (before === undefined) delete process.env.AUTO_ASSIGN_ENABLED;
      else process.env.AUTO_ASSIGN_ENABLED = before;
    }
    expect(toRiders()).toEqual([['delivery:new', { deliveryId: 'd1', orderId: 'o1' }]]);
  });
});

describe('a job taken from the pool', () => {
  beforeEach(() => {
    db.order.findUnique.mockResolvedValue({
      customerId: 'cust',
      orderNumber: 'FN1',
      deliveryType: 'home_delivery',
      items: [{ seller: { userId: 'kitchen' } }],
      delivery: { rider: { userId: 'rider' } },
    });
  });

  it('leaves every other rider\'s list, and the order\'s parties reload', async () => {
    await realtimeOrderService.emitDeliveryClaimed('d1', 'o1');
    expect(toRiders()).toEqual([['delivery:removed', { deliveryId: 'd1', orderId: 'o1', reason: 'claimed' }]]);
    const [rooms, event] = socket.emitToRooms.mock.calls[0];
    expect(event).toBe('delivery:assigned');
    expect(rooms).toEqual(expect.arrayContaining(['order:o1', 'user:cust', 'user:kitchen', 'user:rider']));
  });

  it('does not tell the riders about a job they never heard of, but the order\'s parties still reload', async () => {
    await realtimeOrderService.emitDeliveryClaimed('d1', 'o1', { toRiders: false });
    expect(toRiders()).toEqual([]);
    expect(socket.emitToRooms.mock.calls[0][1]).toBe('delivery:assigned');
  });
});
