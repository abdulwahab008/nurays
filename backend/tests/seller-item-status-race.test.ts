/**
 * A seller's item step racing a cancel: the cancel wins the order lock and cancels the items, then the seller's step runs
 * on a stale read. It must neither revive the cancelled item nor move the cancelled order on (a self-delivered "delivered"
 * would post a ledger credit for a cancelled order). The database is a double.
 */
type Fn = jest.Mock;

const mockTx = {} as Record<string, Record<string, Fn>> & { $queryRaw: Fn };
const mockDb = {
  seller: { findUnique: jest.fn() },
  orderItem: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb }));
jest.mock('../src/services/handover.service', () => ({
  ...jest.requireActual('../src/services/handover.service'),
  verifyHandoverCode: jest.fn(),
}));
jest.mock('../src/services/ledger.service', () => ({ __esModule: true, default: { recordOrderCompletion: jest.fn() } }));
jest.mock('../src/services/realtime-order.service', () => ({ __esModule: true, default: { emitOrderStatusUpdate: jest.fn(), emitOrderItemStatusUpdate: jest.fn() } }));

import { SellerOrderService } from '../src/services/seller-order.service';
import ledgerService from '../src/services/ledger.service';

const service = new SellerOrderService();
const SELF_CASH = { id: 'o1', orderNumber: 'FN1', deliveryType: 'home_delivery', deliveryProvider: 'self', deliveryFeeBreakdown: null, paymentMethod: 'cod', paymentStatus: 'pending' };

function staleRead(status: string, orderStatus: string) {
  mockDb.seller.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', deliveryProvider: 'self' });
  mockDb.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1', status, order: { ...SELF_CASH, orderStatus } });
}

beforeEach(() => {
  Object.assign(mockTx, {
    $queryRaw: jest.fn(async () => []),
    orderItem: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'i1', status: 'delivered' })),
      findMany: jest.fn(async () => [{ id: 'i1', status: 'delivered' }]),
    },
    order: { findUnique: jest.fn(async () => ({ orderStatus: 'cancelled' })), updateMany: jest.fn(async () => ({ count: 1 })) },
    orderStatusHistory: { create: jest.fn() },
  });
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
});

describe('seller item step racing a cancel', () => {
  it('moves the item only from the status it was read in, and refuses once a cancel changed it', async () => {
    staleRead('ready', 'ready');
    mockTx.orderItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.updateOrderItemStatus('i1', 'u1', 'dispatched')).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_STATUS_CONFLICT' });
    expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', status: 'ready' }, data: { status: 'dispatched' } });
    const locks = mockTx.$queryRaw.mock.calls.map((call) => (call[0] as string[]).join('?'));
    expect(locks[0]).toContain('FROM orders');
    expect(mockTx.order.updateMany).not.toHaveBeenCalled();
  });

  it('never moves a cancelled order on, so no delivery or ledger credit follows', async () => {
    staleRead('dispatched', 'dispatched');

    await service.updateOrderItemStatus('i1', 'u1', 'delivered', undefined, '1234');

    expect(mockTx.order.updateMany).not.toHaveBeenCalled();
    expect(mockTx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(ledgerService.recordOrderCompletion).not.toHaveBeenCalled();
  });
});
