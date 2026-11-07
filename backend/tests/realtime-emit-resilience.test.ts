/**
 * The live events sent after a committed change are best effort: a database failure while working out who
 * to tell is logged, never thrown back to the request that already committed. A rider's position goes to
 * the customer only, not to every admin on the platform.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    order: { findUnique: jest.fn() },
    orderItem: { findUnique: jest.fn() },
  },
}));
jest.mock('../src/config/socket', () => ({
  __esModule: true,
  default: { emitToRooms: jest.fn(), emitToRole: jest.fn(), emitToUser: jest.fn() },
}));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifyMany: jest.fn() }));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import realtimeOrderService from '../src/services/realtime-order.service';
import { logger } from '../src/utils/logger';

const findOrder = prisma.order.findUnique as unknown as jest.Mock;
const findItem = prisma.orderItem.findUnique as unknown as jest.Mock;
const emitToRooms = socketManager.emitToRooms as unknown as jest.Mock;
const emitToUser = socketManager.emitToUser as unknown as jest.Mock;
const dbDown = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('after a committed change, the database failing', () => {
  it('does not make the order status event throw, and is logged', async () => {
    findOrder.mockRejectedValue(dbDown);
    await expect(realtimeOrderService.emitOrderStatusUpdate('o1', 'cancelled', 'c1')).resolves.toBeUndefined();
    expect(emitToRooms).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith({ err: dbDown, orderId: 'o1', status: 'cancelled' }, 'order:status:update event failed');
  });

  it('does not make the dish status event throw, and is logged', async () => {
    findItem.mockRejectedValue(dbDown);
    await expect(realtimeOrderService.emitOrderItemStatusUpdate('i1', 'ready')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith({ err: dbDown, orderItemId: 'i1', status: 'ready' }, 'order:item:status:update event failed');
  });
});

describe("a rider's position", () => {
  it('goes to the customer alone, never to the admin room', async () => {
    findOrder.mockResolvedValue({ customerId: 'c1' });
    await realtimeOrderService.emitDeliveryTrackingUpdate('o1', { latitude: 31.5, longitude: 74.3 }, 1.2);
    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith('c1', 'order:delivery:tracking', expect.objectContaining({ orderId: 'o1', location: { latitude: 31.5, longitude: 74.3 }, distanceKm: 1.2 }));
    expect(emitToRooms).not.toHaveBeenCalled();
    expect(socketManager.emitToRole as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('goes nowhere for an order without a customer', async () => {
    findOrder.mockResolvedValue({ customerId: null });
    await realtimeOrderService.emitDeliveryTrackingUpdate('o1', { latitude: 31.5, longitude: 74.3 });
    expect(emitToUser).not.toHaveBeenCalled();
  });
});
