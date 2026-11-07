/**
 * The admin analytics groups paid sales by Pakistan calendar day (the days the dashboard draws), and reports the period's
 * paid order count beside its paid sales so the average paid order is taken over the same orders. The database is a double.
 */
const db: Record<string, unknown> = {};
const queryRaw = jest.fn(async () => [{ date: new Date('2026-11-07T00:00:00Z'), orders: BigInt(4), revenue: '3000' }]);
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import adminOrderService from '../src/services/admin-order.service';

describe('platform analytics', () => {
  beforeEach(() => {
    db.order = {
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async (args: { _count?: boolean }) => ({ _sum: { totalAmount: 3000 }, ...(args._count ? { _count: 4 } : {}) })),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    };
    db.orderItem = { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _sum: { commissionAmount: 0 } })) };
    db.user = { count: jest.fn(async () => 0) };
    db.seller = { count: jest.fn(async () => 0) };
    db.$queryRaw = queryRaw;
  });

  it('buckets the days in Pakistan time', async () => {
    const result = await adminOrderService.getPlatformAnalytics({});
    const sql = (queryRaw.mock.calls[0] as unknown as [string[]])[0].join('?');
    expect(sql).toContain("AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi'");
    expect(sql).not.toMatch(/DATE\(created_at\)/);
    expect(result.revenueByDay).toEqual([{ date: '2026-11-07', orders: 4, revenue: 3000 }]);
  });

  it('reports the paid order count for the period from the same query as the paid sales', async () => {
    const result = await adminOrderService.getPlatformAnalytics({});
    expect(result.overview.periodRevenue).toBe(3000);
    expect(result.overview.periodPaidOrders).toBe(4);
  });
});
