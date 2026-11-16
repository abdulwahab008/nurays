/**
 * A job a rider holds but is not working: an admin can take it back before pickup, and the one-minute sweep takes back
 * an automatically assigned job nobody touched for RIDER_ASSIGN_TIMEOUT_MINUTES. The database is a double.
 */
const mockDb = {
  delivery: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  order: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { emitToUser: jest.fn(), removeUserFromOrder: jest.fn() } }));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(async () => 'n1') }));
jest.mock('../src/services/realtime-order.service', () => ({ __esModule: true, default: { emitDeliveryPosted: jest.fn(), emitOrderStatusUpdate: jest.fn() } }));
jest.mock('../src/services/rider.service', () => ({ __esModule: true, default: { ensureDeliveryForOrder: jest.fn() } }));
jest.mock('../src/services/promotion.service', () => ({ releasePromotionUsage: jest.fn() }));
jest.mock('../src/services/refund.service', () => ({ issueRefund: jest.fn(async () => null) }));
jest.mock('../src/services/ledger.service', () => ({ __esModule: true, default: { recordOrderCompletion: jest.fn() } }));
jest.mock('../src/services/rider-ledger.service', () => ({ postDeliveryEntries: jest.fn(), cashLimitOf: jest.fn() }));
jest.mock('../src/services/hub-allocation.service', () => ({ releaseHubAllocations: jest.fn() }));

import socketManager from '../src/config/socket';
import { notify } from '../src/services/notify.service';
import realtimeOrderService from '../src/services/realtime-order.service';
import adminOrderService from '../src/services/admin-order.service';
import { reclaimIdleAssignments, riderAssignTimeoutMinutes, takeBackDelivery } from '../src/services/dispatch.service';
import { permissionForRequest } from '../src/utils/permissions';
import { notificationText, renderNotification } from '../src/utils/notificationText';

const held = { orderId: 'o1', riderId: 'r1', rider: { userId: 'u-rider' }, order: { orderNumber: 'FN1' } };
const settled = () => new Promise((resolve) => setImmediate(resolve));

const savedEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...savedEnv, AUTO_ASSIGN_ENABLED: 'false' };
  delete process.env.RIDER_ASSIGN_TIMEOUT_MINUTES;
  mockDb.delivery.findUnique.mockResolvedValue(held);
  mockDb.delivery.updateMany.mockResolvedValue({ count: 1 });
});
afterAll(() => {
  process.env = savedEnv;
});

describe('takeBackDelivery', () => {
  it('reopens the job only while it is still that rider\'s and not picked up, tells the rider and re-posts it', async () => {
    await expect(takeBackDelivery('d1')).resolves.toBe(true);
    await settled();

    const call = mockDb.delivery.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'd1', riderId: 'r1', status: { in: ['assigned', 'arrived_at_pickup'] } });
    expect(call.data).toMatchObject({ riderId: null, status: 'pending', riderFee: null, riderBonus: null, releasedRiderIds: { push: 'r1' } });
    expect(socketManager.removeUserFromOrder).toHaveBeenCalledWith('u-rider', 'o1');
    expect(socketManager.emitToUser).toHaveBeenCalledWith('u-rider', 'delivery:cancelled', { deliveryId: 'd1', orderId: 'o1' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-rider', text: notificationText('delivery.takenBack', { orderNumber: 'FN1' }) }));
    expect(realtimeOrderService.emitDeliveryPosted).toHaveBeenCalledWith('d1', 'o1', { exceptUserId: 'u-rider' });
  });

  it('does nothing once the rider has picked the food up (the compare-and-set misses)', async () => {
    mockDb.delivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(takeBackDelivery('d1')).resolves.toBe(false);
    await settled();
    expect(notify).not.toHaveBeenCalled();
    expect(realtimeOrderService.emitDeliveryPosted).not.toHaveBeenCalled();
  });

  it('does nothing for a job no rider holds', async () => {
    mockDb.delivery.findUnique.mockResolvedValue({ ...held, riderId: null, rider: null });

    await expect(takeBackDelivery('d1')).resolves.toBe(false);
    expect(mockDb.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('tells the rider in English and in Urdu', () => {
    const text = notificationText('delivery.takenBack', { orderNumber: 'FN1' });
    expect(renderNotification(text, 'en').message).toContain('Order #FN1 is no longer yours');
    expect(renderNotification(text, 'ur').title).toBe('جاب واپس لے لی گئی');
    expect(renderNotification(text, 'ur').message).toContain('FN1');
  });
});

describe('reclaimIdleAssignments', () => {
  const now = new Date('2026-11-17T10:00:00Z');

  it('takes back auto-assigned jobs untouched for the timeout, and only if still untouched when it writes', async () => {
    mockDb.delivery.findMany.mockResolvedValue([{ id: 'd1' }]);

    await expect(reclaimIdleAssignments(now)).resolves.toBe(1);

    const cutoff = new Date('2026-11-17T09:40:00Z');
    const idle = { status: 'assigned', assignmentMode: 'auto', riderLocationAt: null, updatedAt: { lt: cutoff }, OR: [{ estimatedReadyAt: null }, { estimatedReadyAt: { lt: cutoff } }] };
    expect(mockDb.delivery.findMany.mock.calls[0][0].where).toMatchObject({ ...idle, riderId: { not: null } });
    expect(mockDb.delivery.updateMany.mock.calls[0][0].where).toEqual({ ...idle, id: 'd1', riderId: 'r1' });
  });

  it('leaves a rider who has reported a position, or whose food is not yet 20 minutes overdue', async () => {
    type Job = { riderLocationAt: Date | null; estimatedReadyAt: Date | null; updatedAt: Date };
    type Idle = { riderLocationAt: null; updatedAt: { lt: Date }; OR: [{ estimatedReadyAt: null }, { estimatedReadyAt: { lt: Date } }] };
    mockDb.delivery.findMany.mockResolvedValue([]);
    await reclaimIdleAssignments(now);
    const where: Idle = mockDb.delivery.findMany.mock.calls[0][0].where;
    const reclaimed = (job: Job) =>
      job.riderLocationAt === where.riderLocationAt &&
      job.updatedAt < where.updatedAt.lt &&
      (job.estimatedReadyAt === null || job.estimatedReadyAt < where.OR[1].estimatedReadyAt.lt);
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

    // Assigned 25 minutes ago at accept, with a 45-minute preparation: nothing to collect yet.
    expect(reclaimed({ riderLocationAt: null, updatedAt: at(25), estimatedReadyAt: at(-20) })).toBe(false);
    // The phone reported once and then went quiet (locked, or the rider is in a maps app).
    expect(reclaimed({ riderLocationAt: at(24), updatedAt: at(24), estimatedReadyAt: at(30) })).toBe(false);
    // Never moved on it, and the food has been waiting 25 minutes.
    expect(reclaimed({ riderLocationAt: null, updatedAt: at(70), estimatedReadyAt: at(25) })).toBe(true);
  });

  it('leaves a job whose rider moved between the read and the write', async () => {
    mockDb.delivery.findMany.mockResolvedValue([{ id: 'd1' }]);
    mockDb.delivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(reclaimIdleAssignments(now)).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reads the timeout from RIDER_ASSIGN_TIMEOUT_MINUTES, 20 minutes when unset or not a positive number', () => {
    expect(riderAssignTimeoutMinutes({})).toBe(20);
    expect(riderAssignTimeoutMinutes({ RIDER_ASSIGN_TIMEOUT_MINUTES: '5' })).toBe(5);
    expect(riderAssignTimeoutMinutes({ RIDER_ASSIGN_TIMEOUT_MINUTES: '0' })).toBe(20);
    expect(riderAssignTimeoutMinutes({ RIDER_ASSIGN_TIMEOUT_MINUTES: 'soon' })).toBe(20);
  });
});

describe('admin unassign rider', () => {
  it('takes the job back and reports it', async () => {
    mockDb.delivery.findUnique.mockImplementation(async (args: { where: { orderId?: string } }) => (args.where.orderId ? { id: 'd1', riderId: 'r1' } : held));

    await expect(adminOrderService.unassignRider('o1', 'admin-1')).resolves.toEqual({ orderId: 'o1', deliveryId: 'd1', unassigned: true });
    expect(mockDb.delivery.updateMany.mock.calls[0][0].where).toEqual({ id: 'd1', riderId: 'r1', status: { in: ['assigned', 'arrived_at_pickup'] } });
  });

  it('refuses after pickup, or when no rider holds the job', async () => {
    mockDb.delivery.findUnique.mockImplementation(async (args: { where: { orderId?: string } }) => (args.where.orderId ? { id: 'd1', riderId: 'r1' } : held));
    mockDb.delivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(adminOrderService.unassignRider('o1', 'admin-1')).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_UNASSIGN' });
  });

  it('is a 404 for an order with no rider job', async () => {
    mockDb.delivery.findUnique.mockResolvedValue(null);

    await expect(adminOrderService.unassignRider('o1', 'admin-1')).rejects.toMatchObject({ statusCode: 404, code: 'DELIVERY_NOT_FOUND' });
  });

  it('needs ops.write, so support staff cannot use it', () => {
    expect(permissionForRequest('POST', '/orders/o1/unassign-rider')).toBe('ops.write');
  });
});
