/**
 * The rider's job list (GET /riders/deliveries/mine) is reloaded every 30 seconds by every rider on duty, so it
 * carries every running job and only the latest few finished ones. What it asks the database for is what these
 * tests pin down: how many finished jobs, which statuses count as finished, and that a running job is never cut off.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    rider: { findUnique: jest.fn() },
    delivery: { findMany: jest.fn() },
    riderLedgerEntry: { groupBy: jest.fn().mockResolvedValue([]) },
  },
}));

import riderService, { DEFAULT_JOB_HISTORY, MAX_JOB_HISTORY } from '../src/services/rider.service';
import prisma from '../src/config/database';

const findRider = (prisma as any).rider.findUnique as jest.Mock;
const findDeliveries = (prisma as any).delivery.findMany as jest.Mock;

const job = (id: string, status: string, minutesAgo: number) => ({
  id,
  orderId: `order-${id}`,
  riderId: 'rider-1',
  status,
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
  pickupAddress: 'Kitchen',
  deliveryAddress: 'Street 1',
  order: {
    orderNumber: id,
    totalAmount: 500,
    paymentMethod: 'cod',
    orderStatus: 'confirmed',
    deliveryInstructions: null,
    deliveryAddressSnapshot: null,
    deliveryAddress: null,
    customer: null,
  },
});

/** The database answers the running-jobs query and the finished-jobs query by what they ask for. */
function database(running: any[], finished: any[]) {
  findDeliveries.mockImplementation(async (args: any) => (args.where.status.notIn ? running : finished));
}
const queries = () => findDeliveries.mock.calls.map(([args]) => args);
const finishedQuery = () => queries().find((q) => q.where.status.in);
const runningQuery = () => queries().find((q) => q.where.status.notIn);

beforeEach(() => {
  findRider.mockReset();
  findDeliveries.mockReset();
  findRider.mockResolvedValue({ id: 'rider-1', userId: 'user-1', status: 'active', verificationStatus: 'approved' });
});

describe('getMyDeliveries', () => {
  it('asks for every running job without a limit, and the latest finished ones up to the default', async () => {
    database([], []);
    await riderService.getMyDeliveries('user-1');
    expect(runningQuery().take).toBeUndefined();
    expect(runningQuery().where).toMatchObject({ riderId: 'rider-1', status: { notIn: ['delivered', 'delivery_failed', 'cancelled'] } });
    expect(finishedQuery().take).toBe(DEFAULT_JOB_HISTORY);
    expect(finishedQuery().where).toMatchObject({ riderId: 'rider-1', status: { in: ['delivered', 'delivery_failed', 'cancelled'] } });
    expect(finishedQuery().orderBy).toEqual({ createdAt: 'desc' });
  });

  it('keeps hiding jobs cancelled more than a day ago', async () => {
    database([], []);
    await riderService.getMyDeliveries('user-1');
    const { NOT } = finishedQuery().where;
    expect(NOT.status).toBe('cancelled');
    const cutoff = NOT.updatedAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(23.9 * 3600_000);
    expect(Date.now() - cutoff.getTime()).toBeLessThan(24.1 * 3600_000);
  });

  it('lists running jobs first, furthest along on top, then finished jobs newest first', async () => {
    database([job('r1', 'assigned', 5), job('r2', 'arrived_at_pickup', 20)], [job('f1', 'delivered', 10), job('f2', 'delivered', 60)]);
    const list = await riderService.getMyDeliveries('user-1');
    expect(list.map((j) => j.id)).toEqual(['r2', 'r1', 'f1', 'f2']);
  });

  it('keeps the older job on top when two running jobs are at the same step', async () => {
    database([job('r1', 'assigned', 5), job('r2', 'assigned', 20)], []);
    const list = await riderService.getMyDeliveries('user-1');
    expect(list.map((j) => j.id)).toEqual(['r2', 'r1']);
  });

  it('asks for no finished jobs at all when told to (the pop-up only needs to count the running ones)', async () => {
    database([job('r1', 'assigned', 5)], [job('f1', 'delivered', 10)]);
    const list = await riderService.getMyDeliveries('user-1', 0);
    expect(finishedQuery()).toBeUndefined();
    expect(list.map((j) => j.id)).toEqual(['r1']);
  });

  it('can be asked for more history, but never more than the ceiling, and ignores nonsense', async () => {
    database([], []);
    await riderService.getMyDeliveries('user-1', 120);
    expect(finishedQuery().take).toBe(120);
    findDeliveries.mockClear();
    await riderService.getMyDeliveries('user-1', 100_000);
    expect(finishedQuery().take).toBe(MAX_JOB_HISTORY);
    findDeliveries.mockClear();
    await riderService.getMyDeliveries('user-1', -5);
    expect(finishedQuery()).toBeUndefined();
    findDeliveries.mockClear();
    await riderService.getMyDeliveries('user-1', 12.9);
    expect(finishedQuery().take).toBe(12);
  });

  it('still refuses a rider who is not approved', async () => {
    findRider.mockResolvedValue({ id: 'rider-1', userId: 'user-1', status: 'active', verificationStatus: 'pending' });
    await expect(riderService.getMyDeliveries('user-1')).rejects.toMatchObject({ code: 'RIDER_NOT_APPROVED' });
    expect(findDeliveries).not.toHaveBeenCalled();
  });
});

describe('where the rider collects the food', () => {
  const kitchen = (seller: Record<string, unknown>) => ({
    status: 'confirmed',
    fulfillmentType: 'seller',
    seller: { businessName: "Saima's Kitchen", pickupAddress: null, pickupLandmark: null, pickupPhone: null, primaryCommunityName: null, latitude: null, longitude: null, deliveryProvider: 'platform', user: { phone: '03001234567' }, ...seller },
  });
  const withKitchen = (status: string, seller: Record<string, unknown>, riderId: string | null = 'rider-1') => {
    const j = job('k1', status, 5);
    return { ...j, riderId, pickupAddress: "Saima's Kitchen", order: { ...j.order, items: [kitchen(seller)] } };
  };

  it("gives the kitchen's street address, landmark, phone and pin to the rider holding the job", async () => {
    database([withKitchen('assigned', { pickupAddress: 'House 12, Street 4', primaryCommunityName: 'DHA Phase 5', pickupLandmark: 'Green gate', pickupPhone: '03110000000', latitude: 31.47, longitude: 74.4 })], []);
    const [j] = await riderService.getMyDeliveries('user-1');
    expect(j.pickupAddress).toBe("Saima's Kitchen, House 12, Street 4, DHA Phase 5");
    expect(j.pickup).toEqual({ name: "Saima's Kitchen", address: 'House 12, Street 4', area: 'DHA Phase 5', landmark: 'Green gate', phone: '03110000000' });
    expect([j.pickupLatitude, j.pickupLongitude]).toEqual([31.47, 74.4]);
    expect(j.pickupMapsUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=31.47,74.4');
  });

  it("falls back to the kitchen owner's phone, and never sends Maps to search a kitchen's bare name", async () => {
    database([withKitchen('assigned', {})], []);
    const [j] = await riderService.getMyDeliveries('user-1');
    expect(j.pickup.phone).toBe('03001234567');
    expect(j.pickupLatitude).toBeNull();
    expect(j.pickupMapsUrl).toBeNull();
  });

  it('keeps the kitchen phone from a job nobody holds yet', async () => {
    database([], [withKitchen('delivered', { pickupPhone: '03110000000' })]);
    const [j] = await riderService.getMyDeliveries('user-1');
    expect(j.pickup.phone).toBeNull();
  });
});
