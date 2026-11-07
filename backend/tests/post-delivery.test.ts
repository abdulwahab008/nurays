/**
 * A delivery job joining the open pool is offered to the best rider first. Riders hear that it is in
 * the pool only when nobody could take it, so an order that is assigned at once costs no rider a reload,
 * and only the riders who can take it (on duty) hear it at all.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { order: { findUnique: jest.fn() } },
}));
jest.mock('../src/config/socket', () => ({
  __esModule: true,
  ON_DUTY_RIDERS_ROOM: 'riders:on-duty',
  default: { emitToRole: jest.fn(), emitToOnDutyRiders: jest.fn(), emitToRooms: jest.fn(), emitToUser: jest.fn(), getIO: jest.fn() },
}));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifyMany: jest.fn() }));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import realtimeOrderService from '../src/services/realtime-order.service';
import { postDelivery } from '../src/services/dispatch.service';

const socket = socketManager as any;
const db = prisma as any;

/** The events sent to the riders who are on duty, as [event, payload]. */
const toRiders = () => socket.emitToOnDutyRiders.mock.calls.map((c: unknown[]) => [c[0], c[1]]);

describe('postDelivery', () => {
  it('says nothing to the riders when a rider takes the job at once', async () => {
    const dispatch = jest.fn().mockResolvedValue({ assigned: true, riderId: 'r1' });
    await postDelivery('d1', 'o1', { dispatch });
    expect(dispatch).toHaveBeenCalledWith('d1', { announced: false });
    expect(toRiders()).toEqual([]);
  });

  it('announces the job to the riders on duty when nobody can take it, and to no one else', async () => {
    for (const reason of ['no_riders', 'no_eligible_rider', 'disabled', 'lost_race']) {
      socket.emitToOnDutyRiders.mockClear();
      await postDelivery('d1', 'o1', { dispatch: jest.fn().mockResolvedValue({ assigned: false, reason }) });
      expect(toRiders()).toEqual([['delivery:new', { deliveryId: 'd1', orderId: 'o1' }]]);
    }
    // Not to every rider: one who is off duty cannot claim a job, so it would only make their dashboard reload.
    expect(socket.emitToRole).not.toHaveBeenCalled();
  });

  it('never leaves a job unannounced when the dispatcher fails', async () => {
    await expect(postDelivery('d1', 'o1', { dispatch: jest.fn().mockRejectedValue(new Error('database is down')) })).resolves.toBeUndefined();
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

describe('a job a rider hands back', () => {
  /** Records the room the event goes to, the rooms left out, and what is sent. */
  const fakeIo = () => {
    const sent: { to: string[]; except: string[]; event?: string; payload?: unknown } = { to: [], except: [] };
    const chain = {
      to: (room: string) => (sent.to.push(room), chain),
      except: (room: string) => (sent.except.push(room), chain),
      emit: (event: string, payload: unknown) => {
        sent.event = event;
        sent.payload = payload;
      },
    };
    socket.getIO.mockReturnValue(chain);
    return sent;
  };

  it('is announced to the riders on duty except every device of the rider who handed it back', async () => {
    const sent = fakeIo();
    await postDelivery('d1', 'o1', { releasedByUserId: 'u-rider', dispatch: jest.fn().mockResolvedValue({ assigned: false, reason: 'no_eligible_rider' }) });
    expect(sent).toEqual({ to: ['riders:on-duty'], except: ['user:u-rider'], event: 'delivery:new', payload: { deliveryId: 'd1', orderId: 'o1' } });
    expect(toRiders()).toEqual([]);
  });

  it('is not announced to anyone when another rider takes it at once', async () => {
    const sent = fakeIo();
    await postDelivery('d1', 'o1', { releasedByUserId: 'u-rider', dispatch: jest.fn().mockResolvedValue({ assigned: true, riderId: 'r2' }) });
    expect(sent.event).toBeUndefined();
    expect(toRiders()).toEqual([]);
  });

  it('does not fail the hand-back when realtime is not running', async () => {
    socket.getIO.mockImplementation(() => {
      throw new Error('Socket.io not initialized');
    });
    await expect(
      postDelivery('d1', 'o1', { releasedByUserId: 'u-rider', dispatch: jest.fn().mockResolvedValue({ assigned: false }) })
    ).resolves.toBeUndefined();
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

  it('leaves the list of every rider on duty, and the order\'s parties reload', async () => {
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
