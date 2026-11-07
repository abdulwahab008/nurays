/**
 * Admin cancel of a 'ready' order no rider has taken (rider shortage), restock in the lock order placement uses, and an
 * admin "delivered" that commits as one transaction. The database is a double.
 */
type Fn = jest.Mock;
type Tx = Record<string, Record<string, Fn>> & { $queryRaw: Fn };

const mockTx = {} as Tx;
const mockDb = { order: { findUnique: jest.fn() }, $transaction: jest.fn() };
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb }));
jest.mock('../src/services/delivery-lifecycle.service', () => ({
  cancelOpenDelivery: jest.fn(async () => null),
  notifyDeliveryCancelled: jest.fn(),
  reopenDeliveryData: jest.fn(),
}));
jest.mock('../src/services/dispatch.service', () => ({ postDeliverySoon: jest.fn() }));
jest.mock('../src/services/realtime-order.service', () => ({ __esModule: true, default: { emitOrderStatusUpdate: jest.fn() } }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/rider.service', () => ({ __esModule: true, default: { ensureDeliveryForOrder: jest.fn() } }));
jest.mock('../src/services/promotion.service', () => ({ releasePromotionUsage: jest.fn() }));
jest.mock('../src/services/refund.service', () => ({ issueRefund: jest.fn(async () => null) }));
jest.mock('../src/services/ledger.service', () => ({ __esModule: true, default: { recordOrderCompletion: jest.fn() } }));
jest.mock('../src/services/rider-ledger.service', () => ({ postDeliveryEntries: jest.fn() }));
jest.mock('../src/services/hub-allocation.service', () => ({ releaseHubAllocations: jest.fn() }));

import adminOrderService from '../src/services/admin-order.service';
import ledgerService from '../src/services/ledger.service';
import { postDeliveryEntries } from '../src/services/rider-ledger.service';

const readyOrder = {
  id: 'o1',
  orderNumber: 'FN1',
  orderStatus: 'ready',
  paymentStatus: 'pending',
  paymentMethod: 'cod',
  totalAmount: 500,
  deliveryType: 'home_delivery',
  deliveryProvider: 'platform',
  items: [{ status: 'ready', fulfillmentType: 'kitchen', seller: { deliveryProvider: 'platform' } }],
};

beforeEach(() => {
  Object.assign(mockTx, {
    $queryRaw: jest.fn(async () => []),
    order: { updateMany: jest.fn(async () => ({ count: 1 })), findUniqueOrThrow: jest.fn(async () => ({ ...readyOrder, orderStatus: 'cancelled' })) },
    orderItem: {
      findMany: jest.fn(async () => [
        { productId: 'p-b', variantId: null, quantity: 1 },
        { productId: 'p-a', variantId: 'v-2', quantity: 2 },
        { productId: 'p-a', variantId: null, quantity: 3 },
      ]),
      updateMany: jest.fn(),
    },
    product: { update: jest.fn() },
    productVariant: { update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    delivery: { findFirst: jest.fn(async () => null), updateMany: jest.fn() },
    rider: { update: jest.fn() },
  });
  mockDb.order.findUnique.mockResolvedValue(readyOrder);
  mockDb.$transaction.mockImplementation(async (fn: (tx: Tx) => unknown) => fn(mockTx));
});

describe('admin cancel of a ready order', () => {
  it('cancels when no rider has the job, locking the order and its job first', async () => {
    const result = await adminOrderService.cancelOrder('o1', 'admin-1', 'no rider available');

    expect(result.status).toBe('cancelled');
    const locks = mockTx.$queryRaw.mock.calls.map((call) => (call[0] as string[]).join('?'));
    expect(locks[0]).toContain('FROM orders');
    expect(locks[1]).toContain('FROM deliveries');
    expect(mockTx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', orderStatus: { in: ['ready'] } } }));
  });

  it('refuses once a rider has taken the job, without touching the order', async () => {
    mockTx.$queryRaw.mockImplementation(async (sql: string[]) => (sql.join('').includes('deliveries') ? [{ rider_id: 'r1' }] : []));

    await expect(adminOrderService.cancelOrder('o1', 'admin-1', 'x')).rejects.toMatchObject({ statusCode: 409, code: 'RIDER_ASSIGNED' });
    expect(mockTx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['self pickup', { deliveryType: 'self_pickup', deliveryProvider: null }],
    ['kitchen self-delivery', { deliveryProvider: 'self' }],
    ['legacy order whose kitchen delivers itself', { deliveryProvider: null, items: [{ status: 'ready', fulfillmentType: 'kitchen', seller: { deliveryProvider: 'self' } }] }],
  ])('refuses a ready %s order, which no platform rider will take', async (_label, overrides) => {
    mockDb.order.findUnique.mockResolvedValue({ ...readyOrder, ...overrides });

    await expect(adminOrderService.cancelOrder('o1', 'admin-1', 'x')).rejects.toMatchObject({ statusCode: 400, code: 'ORDER_NOT_CANCELLABLE' });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('is not open to the automatic (system) cancel', async () => {
    await expect(adminOrderService.cancelOrder('o1', null, 'x', { by: 'system' })).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  it('restocks in product/variant order, as placement takes stock', async () => {
    await adminOrderService.cancelOrder('o1', 'admin-1', 'x');

    const productOrder = mockTx.product.update.mock.calls.map((call) => call[0].where.id);
    expect(productOrder).toEqual(['p-a', 'p-a', 'p-b']);
    expect(mockTx.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v-2' }, data: { stockQuantity: { increment: 2 } } });
    expect(mockTx.product.update.mock.calls[0][0].data.stockQuantity).toEqual({ increment: 3 });
  });
});

describe('admin mark delivered', () => {
  const dispatched = { ...readyOrder, orderStatus: 'in_transit' };

  beforeEach(() => {
    mockDb.order.findUnique.mockResolvedValue(dispatched);
    mockTx.order.findUniqueOrThrow.mockResolvedValue({ ...dispatched, orderStatus: 'delivered' });
    mockTx.delivery.findFirst.mockResolvedValue({ id: 'd1', riderId: 'r1', status: 'in_transit', riderFee: 100, riderBonus: 0 });
    mockTx.delivery.updateMany.mockResolvedValue({ count: 1 });
  });

  it('writes the order, items, rider job and history in one transaction, then posts the ledger', async () => {
    await adminOrderService.updateOrderStatus('o1', 'admin-1', 'delivered');

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.orderItem.updateMany).toHaveBeenCalled();
    expect(postDeliveryEntries).toHaveBeenCalledWith(mockTx, expect.objectContaining({ riderId: 'r1', deliveryId: 'd1' }));
    expect(mockTx.orderStatusHistory.create).toHaveBeenCalled();
    expect(ledgerService.recordOrderCompletion).toHaveBeenCalledWith('o1');
  });

  it('rolls the whole change back when the rider ledger fails', async () => {
    (postDeliveryEntries as Fn).mockRejectedValueOnce(new Error('db down'));

    await expect(adminOrderService.updateOrderStatus('o1', 'admin-1', 'delivered')).rejects.toThrow('db down');
    expect(mockTx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(ledgerService.recordOrderCompletion).not.toHaveBeenCalled();
  });
});
