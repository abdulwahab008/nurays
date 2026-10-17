/**
 * How the kitchen's analytics counts its orders. Every order is in exactly one bucket, and "completed" is the set of
 * orders the revenue comes from, so "average order value = revenue / completed" and "in the kitchen" are right when
 * some orders were refunded after delivery or were delivered without the money arriving.
 */
import { isEarned, orderCounts, type ReportLine } from '../src/services/seller-reporting';

const line = (orderId: string, orderStatus: string, paymentStatus: string, status = 'delivered'): ReportLine => ({
  status,
  quantity: 1,
  sellerPayout: 100,
  order: { id: orderId, orderStatus, paymentStatus, createdAt: new Date() },
});

describe('orderCounts', () => {
  it.each([
    ['pending', 'pending', 'pending', 'inProgress'],
    ['preparing', 'preparing', 'pending', 'inProgress'],
    ['ready', 'ready', 'paid', 'inProgress'],
    ['on the road', 'in_transit', 'paid', 'inProgress'],
    ['delivered and paid', 'delivered', 'paid', 'completed'],
    ['completed and paid', 'completed', 'paid', 'completed'],
    ['delivered, partly refunded (still paid)', 'delivered', 'paid', 'completed'],
    ['delivered, cash not collected', 'delivered', 'pending', 'awaitingPayment'],
    ['delivered, transfer not confirmed', 'delivered', 'payment_submitted', 'awaitingPayment'],
    ['delivered, payment failed', 'delivered', 'failed', 'awaitingPayment'],
    ['delivered, then fully refunded (manual)', 'delivered', 'refund_pending', 'cancelled'],
    ['delivered, then fully refunded (done)', 'delivered', 'refunded', 'cancelled'],
    ['refunded to the wallet', 'refunded', 'refunded', 'cancelled'],
    ['cancelled before it went out', 'cancelled', 'pending', 'cancelled'],
    ['cancelled after it was paid', 'cancelled', 'refund_pending', 'cancelled'],
  ] as const)('%s is %s', (_name, orderStatus, paymentStatus, bucket) => {
    const counts = orderCounts([line('o1', orderStatus, paymentStatus)]);
    expect(counts.total).toBe(1);
    expect(counts[bucket]).toBe(1);
    expect(counts.completed + counts.cancelled + counts.inProgress + counts.awaitingPayment).toBe(1);
  });

  it('counts an order once however many of the kitchen\'s lines it has, and keeps it when one line was cancelled', () => {
    const counts = orderCounts([line('o1', 'delivered', 'paid'), line('o1', 'delivered', 'paid', 'cancelled'), line('o1', 'delivered', 'paid')]);
    expect(counts).toEqual({ total: 1, completed: 1, cancelled: 0, inProgress: 0, awaitingPayment: 0 });
  });

  it('puts an order none of whose lines is left with the cancelled ones, even when the order was delivered and paid', () => {
    const counts = orderCounts([line('o1', 'delivered', 'paid', 'cancelled'), line('o1', 'delivered', 'paid', 'cancelled')]);
    expect(counts).toEqual({ total: 1, completed: 0, cancelled: 1, inProgress: 0, awaitingPayment: 0 });
  });

  it('adds up: the buckets always sum to the total, and completed is exactly the orders with an earned line', () => {
    const lines = [
      line('a', 'delivered', 'paid'),
      line('b', 'cancelled', 'pending', 'cancelled'),
      line('c', 'delivered', 'refund_pending'),
      line('d', 'refunded', 'refunded'),
      line('e', 'delivered', 'paid'),
      line('f', 'delivered', 'pending'),
      line('g', 'preparing', 'pending'),
    ];
    const counts = orderCounts(lines);
    expect(counts).toEqual({ total: 7, completed: 2, cancelled: 3, inProgress: 1, awaitingPayment: 1 });
    expect(counts.completed + counts.cancelled + counts.inProgress + counts.awaitingPayment).toBe(counts.total);
    const earnedOrders = new Set(lines.filter(isEarned).map((l) => l.order!.id));
    expect(counts.completed).toBe(earnedOrders.size);
  });

  it('ignores a line with no order and counts nothing for no lines', () => {
    expect(orderCounts([{ status: 'delivered', quantity: 1, sellerPayout: 1, order: null }])).toEqual({ total: 0, completed: 0, cancelled: 0, inProgress: 0, awaitingPayment: 0 });
    expect(orderCounts([])).toEqual({ total: 0, completed: 0, cancelled: 0, inProgress: 0, awaitingPayment: 0 });
  });
});
