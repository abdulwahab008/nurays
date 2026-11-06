/**
 * Accepting an order can carry the kitchen's own "Ready in about" time, and a kitchen's order list pages by orders, not by
 * dishes (one order's dishes used to be split across pages, and the page count counted dishes). The database is a double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/rider.service', () => ({ __esModule: true, default: { ensureDeliveryForOrder: jest.fn() } }));
jest.mock('../src/services/realtime-order.service', () => ({ __esModule: true, default: { emitOrderStatusUpdate: jest.fn() } }));
jest.mock('../src/storage', () => ({ presentFile: jest.fn(async (u: unknown) => u) }));

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

  it('takes no body, or a whole number of minutes from 5 to 240', () => {
    expect(acceptOrderSchema.safeParse(undefined).success).toBe(true);
    expect(acceptOrderSchema.safeParse({}).success).toBe(true);
    expect(acceptOrderSchema.safeParse({ preparationTime: 30 }).success).toBe(true);
    for (const bad of [0, 4, 241, 12.5, '30']) expect(acceptOrderSchema.safeParse({ preparationTime: bad }).success).toBe(false);
  });
});

describe("a kitchen's order list", () => {
  it('pages by order and returns every one of its dishes on those orders', async () => {
    db.seller = { findUnique: jest.fn(async () => ({ id: 's1', deliveryProvider: 'platform' })) };
    const baseOrder = { orderStatus: 'pending', paymentStatus: 'pending', paymentMethod: 'cod', totalAmount: '0', createdAt: new Date(), deliveryType: 'home_delivery', deliveryFeeBreakdown: null, customer: null, deliveryAddress: null };
    db.order = { findMany: jest.fn(async () => [{ id: 'o2' }, { id: 'o1' }]), count: jest.fn(async () => 7) };
    const dish = (id: string, orderId: string) => ({ id, status: 'pending', quantity: 1, unitPrice: '100', totalPrice: '100', sellerPayout: '90', product: null, order: { ...baseOrder, id: orderId, orderNumber: orderId } });
    db.orderItem = { findMany: jest.fn(async () => [dish('a', 'o1'), dish('b', 'o2'), dish('c', 'o1'), dish('d', 'o1')]) };

    const out: any = await sellerOrderService.getSellerOrders('u1', { page: 2, limit: 2 });
    expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 2, where: { items: { some: { sellerId: 's1' } } } }));
    expect(db.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sellerId: 's1', orderId: { in: ['o2', 'o1'] } } }));
    expect(out.orders.map((o: any) => [o.order.id, o.items.length])).toEqual([['o2', 1], ['o1', 3]]);
    expect(out.pagination).toEqual({ page: 2, limit: 2, total: 7, totalPages: 4 });
  });
});
