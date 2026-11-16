/**
 * A transfer the customer reported and the kitchen disputed may still have left the customer's account. Cancelling
 * such an order must queue a refund for an admin to check (and send or dismiss), as it does for a transfer nobody
 * has confirmed yet, instead of recording nothing.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import { issueRefund, refundForCancelledItems } from '../src/services/refund.service';

type Tx = Parameters<typeof issueRefund>[0];

function txFor(paymentStatus: string) {
  const mock = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'o1',
        orderNumber: 'FN1',
        customerId: 'c1',
        orderStatus: 'cancelled',
        paymentStatus,
        paymentMethod: 'jazzcash',
        totalAmount: 1575,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    refund: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
    orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  return { mock, tx: mock as unknown as Tx };
}

const opts = { reason: 'Order cancelled by customer: changed mind', createdBy: 'c1' };

describe('cancelling an order whose transfer the kitchen disputed', () => {
  it('queues a pending manual refund of the full total, flagged for checking', async () => {
    const { mock, tx } = txFor('disputed');
    const refund = await issueRefund(tx, 'o1', opts);

    expect(refund).toEqual({ refundId: 'r1', amount: 1575, method: 'manual', status: 'pending', fullyRefunded: true });
    const created = mock.refund.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ orderId: 'o1', customerId: 'c1', amount: 1575, method: 'manual', status: 'pending' });
    expect(created.reason).toContain('DISPUTED TRANSFER');
    expect(mock.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { paymentStatus: 'refund_pending' } });
    expect(mock.orderStatusHistory.create.mock.calls[0][0].data.notes).toContain('disputed by the kitchen');
  });

  it('still locks the order row before reading it', async () => {
    const { mock, tx } = txFor('disputed');
    await issueRefund(tx, 'o1', opts);
    expect(mock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mock.order.findUnique.mock.invocationCallOrder[0]);
  });

  it('a transfer nobody confirmed keeps its own flag', async () => {
    const { mock, tx } = txFor('payment_submitted');
    await issueRefund(tx, 'o1', opts);
    expect(mock.refund.create.mock.calls[0][0].data.reason).toContain('UNCONFIRMED TRANSFER');
  });

  it.each(['pending', 'failed'])('an order that was never paid (%s) still gets no refund', async (status) => {
    const { mock, tx } = txFor(status);
    expect(await issueRefund(tx, 'o1', opts)).toBeNull();
    expect(mock.refund.create).not.toHaveBeenCalled();
  });
});

describe('a kitchen cancelling one item of an order whose transfer it disputed', () => {
  const partial = { reason: 'Item cancelled by the kitchen', createdBy: 's1', orderFullyCancelled: false };
  const items = [
    { id: 'i1', sellerId: 's1', status: 'cancelled', totalPrice: 1000, promoDiscount: 0 },
    { id: 'i2', sellerId: 's1', status: 'preparing', totalPrice: 1000, promoDiscount: 0 },
  ];
  function partialTx(paymentStatus: string) {
    const { mock } = txFor(paymentStatus);
    mock.order.findUnique.mockResolvedValue({
      id: 'o1',
      orderNumber: 'FN1',
      customerId: 'c1',
      orderStatus: 'preparing',
      paymentStatus,
      paymentMethod: 'jazzcash',
      subtotal: 2000,
      discountAmount: 0,
      deliveryFee: 0,
      sellerDeliveryCharge: 0,
      deliveryFeeBreakdown: null,
      taxAmount: 100,
      totalAmount: 2100,
    });
    const orderItem = { findMany: jest.fn().mockResolvedValue(items) };
    return { mock: { ...mock, orderItem }, tx: { ...mock, orderItem } as unknown as Tx };
  }

  it("queues a flagged refund for that item and leaves the order's total as the customer sent it", async () => {
    const { mock, tx } = partialTx('disputed');
    const refund = await refundForCancelledItems(tx, 'o1', ['i1'], partial);

    expect(refund).toEqual({ refundId: 'r1', amount: 1050, method: 'manual', status: 'pending', fullyRefunded: false });
    expect(mock.refund.create.mock.calls[0][0].data.reason).toContain('DISPUTED TRANSFER');
    expect(mock.order.update).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed'])('still re-prices an order that was never paid (%s) instead of refunding', async (status) => {
    const { mock, tx } = partialTx(status);
    expect(await refundForCancelledItems(tx, 'o1', ['i1'], partial)).toBeNull();
    expect(mock.refund.create).not.toHaveBeenCalled();
    expect(mock.order.update.mock.calls[0][0].data).toMatchObject({ subtotal: 1000, totalAmount: 1050 });
  });
});
