/** The System health reading: the ops snapshot, the job lanes and the kitchens at their "orders at a time" limit. */
const db: any = { $queryRaw: jest.fn() };
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/ops-snapshot.service', () => ({ readOpsSnapshot: jest.fn(async () => ({ ordersLastHour: 3 })) }));
const mockLanes = jest.fn();
jest.mock('../src/jobs/queue', () => ({ getLaneHealth: () => mockLanes() }));

import { getSystemHealth } from '../src/services/system-health.service';

it('reports full kitchens with their open orders, and the lanes as the queue gives them', async () => {
  db.$queryRaw.mockResolvedValue([{ id: 'k1', business_name: "Nani Jaan's Handi", max_open_orders: 15, open_orders: BigInt(15) }]);
  mockLanes.mockResolvedValue({ lanes: [{ lane: 'default', waiting: 0, active: 0, delayed: 0, failed: 2, workers: 1 }], failed: [], retrying: [] });
  const health = await getSystemHealth();
  expect(health.fullKitchens).toEqual([{ id: 'k1', name: "Nani Jaan's Handi", limit: 15, openOrders: 15 }]);
  expect(health.queue?.lanes[0]).toMatchObject({ failed: 2, workers: 1 });
  expect(health.ops).toEqual({ ordersLastHour: 3 });
});

it('says there is no queue (rather than failing) without Redis', async () => {
  db.$queryRaw.mockResolvedValue([]);
  mockLanes.mockResolvedValue(null);
  const health = await getSystemHealth();
  expect(health.queue).toBeNull();
  expect(health.fullKitchens).toEqual([]);
});
