/**
 * Prisma's relation `_count` aggregates the whole child table (every order line on the platform)
 * before joining, so "my orders" and the dish page slowed down with the platform's history, not
 * the customer's. The counts now come from rows already loaded or from queries scoped to the ids
 * on the page. The database is a double; what is under test is what each read asks of it.
 */
type Call = { where?: Record<string, unknown>; include?: Record<string, unknown> };

const db = {
  order: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  product: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  seller: { findUnique: jest.fn() },
  review: { groupBy: jest.fn(), count: jest.fn() },
  orderItem: { groupBy: jest.fn(), count: jest.fn() },
  community: { findFirst: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/seller-order.service', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notifySeller: jest.fn(), notify: jest.fn() }));
jest.mock('../src/storage', () => ({ isStoredFile: jest.fn(), presentFile: jest.fn() }));
jest.mock('../src/services/availability.service', () => ({
  isAcceptingOrders: jest.fn(async () => ({ accepting: true, reason: null })),
  computeSellerAvailability: jest.fn(() => ({ status: 'open' })),
}));

import orderQueries from '../src/services/order-queries.service';
import productService from '../src/services/product.service';

const item = (id: string) => ({ id, productId: 'p1', productName: 'Karahi', productImage: null, quantity: 1, status: 'pending', seller: null });

describe('a customer\'s order list', () => {
  it('counts each order\'s lines from the lines it loads, without a relation _count', async () => {
    db.order.findMany.mockResolvedValue([
      { id: 'o1', orderNumber: 'FN1', totalAmount: 900, orderStatus: 'pending', items: [item('i1'), item('i2'), item('i3'), item('i4')] },
    ]);
    db.order.count.mockResolvedValue(1);
    db.order.groupBy.mockResolvedValue([{ orderStatus: 'pending', _count: { _all: 1 } }]);

    const res = await orderQueries.getUserOrders('u1', {});

    const args = db.order.findMany.mock.calls[0][0] as Call;
    expect(args.include).not.toHaveProperty('_count');
    expect(res.orders[0].itemsCount).toBe(4);
    expect(res.orders[0].items).toHaveLength(3);
  });
});

describe('a kitchen\'s dish list', () => {
  it('counts reviews and order lines only for the dishes on the page', async () => {
    db.seller.findUnique.mockResolvedValue({ id: 's1' });
    db.product.findMany.mockResolvedValue([
      { id: 'p1', price: 500, originalPrice: null, images: [] },
      { id: 'p2', price: 300, originalPrice: null, images: [] },
    ]);
    db.product.count.mockResolvedValue(2);
    db.review.groupBy.mockResolvedValue([{ productId: 'p1', _count: { _all: 2 } }]);
    db.orderItem.groupBy.mockResolvedValue([{ productId: 'p1', _count: { _all: 7 } }, { productId: 'p2', _count: { _all: 1 } }]);

    const res = await productService.getSellerProducts('u1', {});

    expect((db.product.findMany.mock.calls[0][0] as Call).include).not.toHaveProperty('_count');
    expect((db.review.groupBy.mock.calls[0][0] as Call).where).toEqual({ productId: { in: ['p1', 'p2'] }, isApproved: true });
    expect((db.orderItem.groupBy.mock.calls[0][0] as Call).where).toEqual({ productId: { in: ['p1', 'p2'] } });
    expect(res.products.map((p) => p._count)).toEqual([{ reviews: 2, orderItems: 7 }, { reviews: 0, orderItems: 1 }]);
  });
});

describe('a dish page', () => {
  it('counts that dish\'s approved reviews and order lines, without a relation _count', async () => {
    db.product.findFirst.mockResolvedValue({
      id: 'p1', approvalStatus: 'approved', price: 500, originalPrice: null, costPrice: 200, ratingAverage: 4.5,
      menuDays: null, images: [], variants: [], tags: [], category: null,
      seller: { id: 's1', userId: 'owner', status: 'active', latitude: null, longitude: null, minPrepTimeMinutes: 30, deliveryProvider: 'platform', community: null, communityDeliveries: [] },
    });
    db.review.count.mockResolvedValue(3);
    db.orderItem.count.mockResolvedValue(12);

    const res = await productService.getProductByIdentifier('p1', 'owner');

    expect((db.product.findFirst.mock.calls[0][0] as Call).include).not.toHaveProperty('_count');
    expect((db.review.count.mock.calls[0][0] as Call).where).toEqual({ productId: 'p1', isApproved: true });
    expect((db.orderItem.count.mock.calls[0][0] as Call).where).toEqual({ productId: 'p1' });
    expect(res._count).toEqual({ reviews: 3, orderItems: 12 });
  });
});
