/**
 * Three rules the owner set: a kitchen's account numbers are shown only once it has accepted the order; a kitchen may
 * have its orders accepted for it; a booked order is due its kitchen's lead time before the delivery window opens.
 */
const db = { order: { findFirst: jest.fn(), findUnique: jest.fn() } };
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import { OrderPayments } from '../src/services/order-payment.service';
import sellerOrderService from '../src/services/seller-order.service';
import { workStartsAt, startsLater } from '../src/utils/preOrder';

const kitchen = {
  id: 'kitchen-1',
  businessName: 'Ammi Kitchen',
  bankName: 'HBL',
  bankAccountName: 'Ammi',
  bankAccountNumber: 'PK36HABB0000000000000001',
  jazzcashNumber: '03001234567',
  jazzcashAccountTitle: null,
  easypaisaNumber: null,
  easypaisaAccountTitle: null,
};
const orderIn = (orderStatus: string) => ({
  id: 'order-1',
  orderNumber: 'NR-1',
  totalAmount: 900,
  paymentMethod: 'bank',
  paymentStatus: 'pending',
  paymentSubmittedAt: null,
  paymentReferenceNumber: null,
  orderStatus,
  items: [{ seller: kitchen }],
});

describe("the kitchen's account numbers", () => {
  const details = (orderStatus: string) => {
    db.order.findFirst.mockResolvedValue(orderIn(orderStatus));
    return new OrderPayments().getSellerPaymentDetails('order-1', 'customer-1');
  };

  it('are not given while the kitchen has not accepted the order', async () => {
    const result = await details('pending');
    expect(result).toMatchObject({ awaitingAcceptance: true, accounts: [], sellerName: 'Ammi Kitchen' });
    expect(JSON.stringify(result)).not.toContain('PK36');
    expect(JSON.stringify(result)).not.toContain('0300');
  });

  it('are given once it has', async () => {
    const result = await details('preparing');
    expect(result.awaitingAcceptance).toBe(false);
    expect(result.accounts.map((a) => a.accountNumber)).toEqual(['03001234567', 'PK36HABB0000000000000001']);
  });

  it.each(['cancelled', 'refunded'])('are not given for a %s order', async (status) => {
    expect((await details(status)).accounts).toEqual([]);
  });
});

describe('a kitchen that has its orders accepted for it', () => {
  const accept = jest.spyOn(sellerOrderService, 'acceptOrder').mockResolvedValue({ orderId: 'order-1', orderStatus: 'preparing', message: '' });
  const placed = (o: { autoAcceptOrders: boolean; paymentMethod?: string; paymentStatus?: string; orderStatus?: string }) =>
    db.order.findUnique.mockResolvedValue({
      orderStatus: o.orderStatus ?? 'pending',
      paymentMethod: o.paymentMethod ?? 'cod',
      paymentStatus: o.paymentStatus ?? 'pending',
      items: [{ seller: { userId: 'kitchen-user', autoAcceptOrders: o.autoAcceptOrders } }],
    });
  beforeEach(() => accept.mockClear());

  it('has a new order accepted as the kitchen', async () => {
    placed({ autoAcceptOrders: true });
    await sellerOrderService.autoAccept('order-1');
    expect(accept).toHaveBeenCalledWith('order-1', 'kitchen-user');
  });

  it.each([
    ['the kitchen accepts by hand', { autoAcceptOrders: false }],
    ['the online payment is not in yet', { autoAcceptOrders: true, paymentMethod: 'safepay' }],
    ['the order is no longer waiting', { autoAcceptOrders: true, orderStatus: 'cancelled' }],
  ])('leaves the order alone when %s', async (_why, o) => {
    placed(o);
    await sellerOrderService.autoAccept('order-1');
    expect(accept).not.toHaveBeenCalled();
  });

  it('accepts an online order once it is paid, and never fails the checkout or the payment', async () => {
    placed({ autoAcceptOrders: true, paymentMethod: 'safepay', paymentStatus: 'paid' });
    accept.mockRejectedValueOnce(new Error('order changed'));
    await expect(sellerOrderService.autoAccept('order-1')).resolves.toBeUndefined();
    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe("when the kitchen starts on a booked order", () => {
  const booked = (deliverySlotTime: string | null) => ({ deliverySlotDate: new Date('2026-11-10T00:00:00Z'), deliverySlotTime });

  it('is its lead time before the window opens in Pakistan, an hour unless the kitchen chose', () => {
    expect(workStartsAt(booked('morning'), null)).toEqual(new Date('2026-11-10T03:00:00Z'));
    expect(workStartsAt(booked('afternoon'), 30)).toEqual(new Date('2026-11-10T06:30:00Z'));
    expect(workStartsAt(booked('evening'), 480)).toEqual(new Date('2026-11-10T04:00:00Z'));
  });

  it('is the start of the day for a day with no window, and never for an order with no day', () => {
    expect(workStartsAt(booked(null), 120)).toEqual(new Date('2026-11-09T19:00:00Z'));
    expect(workStartsAt({ deliverySlotDate: null, deliverySlotTime: 'evening' }, 60)).toBeNull();
    expect(startsLater({ deliverySlotDate: null, deliverySlotTime: null }, 60)).toBe(false);
  });

  it('is later until that moment, and due from it', () => {
    expect(startsLater(booked('evening'), 60, new Date('2026-11-10T10:59:00Z'))).toBe(true);
    expect(startsLater(booked('evening'), 60, new Date('2026-11-10T11:00:00Z'))).toBe(false);
  });
});
