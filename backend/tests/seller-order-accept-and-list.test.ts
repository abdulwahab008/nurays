/**
 * Accepting an order can carry the kitchen's own "Ready in about" time, and a kitchen's order list pages by orders, not by
 * dishes (one order's dishes used to be split across pages, and the page count counted dishes). The database is a double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/rider.service', () => ({ __esModule: true, default: { ensureDeliveryForOrder: jest.fn() } }));
jest.mock('../src/services/realtime-order.service', () => ({ __esModule: true, default: { emitOrderStatusUpdate: jest.fn() } }));
jest.mock('../src/storage', () => ({ presentFile: jest.fn(async (u: unknown) => u) }));

import { Prisma } from '@prisma/client';
import sellerOrderService from '../src/services/seller-order.service';
import riderService from '../src/services/rider.service';
import { acceptOrderSchema } from '../src/validators/seller-order.validator';

describe('accepting an order', () => {
  const history: any[] = [];
  beforeEach(() => {
    history.length = 0;
    const order = { id: 'o1', orderStatus: 'pending', items: [{ id: 'i1', product: { preparationTime: 45 } }] };
    db.seller = { findUnique: jest.fn(async () => ({ id: 's1', minPrepTimeMinutes: 20 })) };
    db.order = { findUnique: jest.fn(async () => order) };
    const tx = {
      order: { updateMany: jest.fn(async () => ({ count: 1 })), findUniqueOrThrow: jest.fn(async () => ({ id: 'o1', orderStatus: 'preparing' })) },
      orderItem: { updateMany: jest.fn() },
      orderStatusHistory: { create: jest.fn(async ({ data }: any) => history.push(data)) },
    };
    db.$transaction = jest.fn(async (fn: (t: unknown) => unknown) => fn(tx));
    (riderService.ensureDeliveryForOrder as jest.Mock).mockReset();
  });

  it("uses the kitchen's chosen time when it gives one", async () => {
    const out = await sellerOrderService.acceptOrder('o1', 'u1', 25);
    expect(out).toMatchObject({ preparationMinutes: 25 });
    expect(riderService.ensureDeliveryForOrder).toHaveBeenCalledWith('o1', 25);
    expect(history[0].notes).toContain('25 min');
  });

  it("falls back to the dishes' own times without one", async () => {
    const out = await sellerOrderService.acceptOrder('o1', 'u1');
    expect(out).toMatchObject({ preparationMinutes: 45 });
  });

  it("refuses an online checkout the customer hasn't paid, and takes it once paid", async () => {
    const online = (paymentStatus: string) => ({ id: 'o1', orderStatus: 'pending', paymentMethod: 'safepay', paymentStatus, items: [{ id: 'i1', product: { preparationTime: 45 } }] });
    db.order.findUnique = jest.fn(async () => online('pending'));
    await expect(sellerOrderService.acceptOrder('o1', 'u1')).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_NOT_CONFIRMED' });
    expect(db.$transaction).not.toHaveBeenCalled();

    db.order.findUnique = jest.fn(async () => online('paid'));
    await expect(sellerOrderService.acceptOrder('o1', 'u1')).resolves.toMatchObject({ preparationMinutes: 45 });
  });

  it('still accepts cash and bank-transfer orders before they are paid', async () => {
    for (const paymentMethod of ['cod', 'bank']) {
      db.order.findUnique = jest.fn(async () => ({ id: 'o1', orderStatus: 'pending', paymentMethod, paymentStatus: 'pending', items: [{ id: 'i1', product: { preparationTime: 45 } }] }));
      await expect(sellerOrderService.acceptOrder('o1', 'u1')).resolves.toMatchObject({ preparationMinutes: 45 });
    }
  });

  it('takes no body, or a whole number of minutes from 5 to 240', () => {
    expect(acceptOrderSchema.safeParse(undefined).success).toBe(true);
    expect(acceptOrderSchema.safeParse({}).success).toBe(true);
    expect(acceptOrderSchema.safeParse({ preparationTime: 30 }).success).toBe(true);
    for (const bad of [0, 4, 241, 12.5, '30']) expect(acceptOrderSchema.safeParse({ preparationTime: bad }).success).toBe(false);
  });
});

describe("a kitchen's order list", () => {
  // The list reads the kitchen's orders with raw SQL driven from its own dishes; each call is told apart by its text.
  let pageIds: string[];
  let active: Array<Record<string, unknown>>;
  let byStatus: Array<{ orderStatus: string; n: number }>;
  const queries: Prisma.Sql[] = [];
  beforeEach(() => {
    queries.length = 0;
    db.$queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values);
      queries.push(query);
      if (query.text.includes('LIMIT')) return pageIds.map((id) => ({ id }));
      if (query.text.includes('GROUP BY')) return byStatus;
      if (query.text.includes('delivery_type')) return active;
      return [{ n: 7 }];
    });
  });
  const pageQuery = () => queries.find((q) => q.text.includes('LIMIT')) as Prisma.Sql;

  it('pages by order and returns every one of its dishes on those orders', async () => {
    db.seller = { findUnique: jest.fn(async () => ({ id: 's1', deliveryProvider: 'platform' })) };
    const baseOrder = { orderStatus: 'pending', paymentStatus: 'pending', paymentMethod: 'cod', totalAmount: '0', createdAt: new Date(), deliveryType: 'home_delivery', deliveryFeeBreakdown: null, customer: null, deliveryAddress: null };
    pageIds = ['o2', 'o1'];
    active = [
      { orderStatus: 'pending', deliveryType: 'home_delivery', deliveryProvider: 'platform' },
      { orderStatus: 'ready', deliveryType: 'home_delivery', deliveryProvider: 'platform' },
      { orderStatus: 'ready', deliveryType: 'self_pickup', deliveryProvider: null },
    ];
    byStatus = [{ orderStatus: 'pending', n: 2 }, { orderStatus: 'preparing', n: 1 }, { orderStatus: 'delivered', n: 4 }];
    db.delivery = { findMany: jest.fn(async () => [{ orderId: 'o1', status: 'assigned', arrivedAtPickup: null, pickupTime: null, rider: { userId: 'r-user' } }]) };
    db.userProfile = { findMany: jest.fn(async () => [{ userId: 'r-user', fullName: 'Imran Ali' }]) };
    const dish = (id: string, orderId: string) => ({ id, status: 'pending', quantity: 1, unitPrice: '100', totalPrice: '100', sellerPayout: '90', product: null, order: { ...baseOrder, id: orderId, orderNumber: orderId } });
    db.orderItem = { findMany: jest.fn(async () => [dish('a', 'o1'), dish('b', 'o2'), dish('c', 'o1'), dish('d', 'o1')]) };

    const out: any = await sellerOrderService.getSellerOrders('u1', { page: 2, limit: 2 });
    expect(pageQuery().values).toEqual(['s1', 2, 2]);
    expect(db.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerId: 's1', orderId: { in: ['o2', 'o1'] } } }));
    expect(out.orders.map((o: any) => [o.order.id, o.items.length])).toEqual([['o2', 1], ['o1', 3]]);
    // No filter: the total is every one of the kitchen's orders, taken from the per-status counts without another query.
    expect(out.pagination).toEqual({ page: 2, limit: 2, total: 7, totalPages: 4 });
    expect(queries).toHaveLength(3);
    expect(out.counts).toEqual({ active: 3, needYou: 2, new: 2, delivered: 4, cancelled: 0 });
    expect(out.orders.map((o: any) => o.order.needsKitchen)).toEqual([true, true]);
    expect(out.orders.find((o: any) => o.order.id === 'o1').order.rider).toEqual({ name: 'Imran', status: 'assigned', arrivedAtPickup: null, pickedUpAt: null });
    expect(out.orders.find((o: any) => o.order.id === 'o2').order.rider).toBeNull();
  });

  it("finds the kitchen's orders from its own dishes, never by walking every order", async () => {
    pageIds = [];
    await sellerOrderService.getSellerOrders('u1', {});
    for (const q of queries) {
      expect(q.text).toMatch(/WITH mine AS MATERIALIZED \(\s*SELECT DISTINCT order_id FROM order_items\s*WHERE seller_id = \$1/);
      expect(q.text).toContain('FROM mine JOIN orders o ON o.id = mine.order_id');
    }
  });

  it('dates a ready order from when it was marked ready', async () => {
    const readyAt = new Date('2026-11-06T16:05:00Z');
    const dish = { id: 'a', status: 'ready', quantity: 1, unitPrice: '100', totalPrice: '100', sellerPayout: '90', product: null, order: { id: 'o1', orderNumber: 'o1', orderStatus: 'ready', paymentStatus: 'paid', paymentMethod: 'cod', totalAmount: '0', createdAt: new Date('2026-11-06T15:00:00Z'), deliveryType: 'home_delivery', deliveryProvider: 'platform', deliveryFeeBreakdown: null, customer: null, deliveryAddress: null } };
    pageIds = ['o1'];
    active = [{ orderStatus: 'ready', deliveryType: 'home_delivery', deliveryProvider: 'platform' }];
    byStatus = [{ orderStatus: 'ready', n: 1 }];
    db.orderItem = { findMany: jest.fn(async () => [dish]) };
    db.orderStatusHistory = { findMany: jest.fn(async () => [{ orderId: 'o1', createdAt: readyAt }]) };

    const out: any = await sellerOrderService.getSellerOrders('u1', { view: 'active' });
    expect(out.orders[0].order).toMatchObject({ readyAt, needsKitchen: false });
    expect(out.counts.needYou).toBe(0);
    expect(out.pagination.total).toBe(1);
  });

  it('reads a tab as its group of statuses', async () => {
    pageIds = [];
    await sellerOrderService.getSellerOrders('u1', { view: 'active' });
    expect(pageQuery().text).toContain('WHERE o.order_status IN ($2,$3,$4,$5,$6,$7)');
    expect(pageQuery().values).toEqual(['s1', 'pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 20, 0]);
  });

  it('counts the matching orders itself when a date or dish status narrows the list', async () => {
    pageIds = [];
    const out: any = await sellerOrderService.getSellerOrders('u1', { status: 'cancelled', dateFrom: '2026-10-01', dateTo: '2026-10-31T23:59:59Z' });
    const count = queries.find((q) => q.text.includes('COUNT(*)::int AS n FROM mine') && !q.text.includes('GROUP BY')) as Prisma.Sql;
    expect(count.text).toContain("o.created_at >= ($3::timestamptz AT TIME ZONE 'UTC') AND o.created_at <= ($4::timestamptz AT TIME ZONE 'UTC')");
    expect(count.values).toEqual(['s1', 'cancelled', '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.000Z']);
    expect(out.pagination.total).toBe(7);
  });
});
