/**
 * The definitions the kitchen's dashboard and its analytics screen both report on, in one
 * place so the same day can't show two different numbers under the same word.
 *
 * "Earned" matches the ledger (seller-balance.service.ts): a line counts only once the order
 * actually arrived AND the money is still ours — a cancelled line, a cancelled order or one
 * refunded back to the customer has earned the kitchen nothing.
 */

export interface ReportLine {
  status: string;
  quantity: number;
  sellerPayout: unknown;
  order: { id: string; orderStatus: string; paymentStatus: string; createdAt: Date } | null;
}

const isDelivered = (orderStatus: string) => orderStatus === 'delivered' || orderStatus === 'completed';
/** The whole order went back to the customer: cancelled, or refunded in full (before or after it arrived). */
const isWithdrawn = (o: { orderStatus: string; paymentStatus: string }) =>
  o.orderStatus === 'cancelled' ||
  o.orderStatus === 'refunded' ||
  o.orderStatus === 'refund_pending' ||
  o.paymentStatus === 'refund_pending' ||
  o.paymentStatus === 'refunded';

export function isEarned(line: ReportLine): boolean {
  const o = line.order;
  return line.status !== 'cancelled' && !!o && isDelivered(o.orderStatus) && o.paymentStatus === 'paid';
}

export interface PeriodTotals {
  /** Distinct orders — never a line or unit count. */
  orders: number;
  /** Units of food sold. Counted separately from money, and never called "sales". */
  unitsSold: number;
  /** The kitchen's own money: seller payout, net of commission and of discounts it funded. */
  revenue: number;
}

export function periodTotals(lines: ReportLine[], since: Date): PeriodTotals {
  const orders = new Set<string>();
  let unitsSold = 0;
  let revenue = 0;
  for (const line of lines) {
    if (!isEarned(line) || !line.order || line.order.createdAt < since) continue;
    orders.add(line.order.id);
    unitsSold += line.quantity;
    revenue += Number(line.sellerPayout);
  }
  return { orders: orders.size, unitsSold, revenue: Math.round(revenue * 100) / 100 };
}

/**
 * Where each order stands for this kitchen. An order is in exactly one bucket, so the buckets add up to
 * the total and every screen can show the same split:
 *  - completed        delivered and still paid: the orders the kitchen's earnings come from (see isEarned)
 *  - cancelled        cancelled, or refunded to the customer (before or after it arrived), or none of
 *                     the kitchen's lines is left: it earned nothing
 *  - inProgress       not delivered yet (accepted, cooking, ready, on the road)
 *  - awaitingPayment  delivered, but the money has not arrived (cash not handed in, a transfer not confirmed)
 */
export interface OrderCounts {
  total: number;
  completed: number;
  cancelled: number;
  inProgress: number;
  awaitingPayment: number;
}

export function orderCounts(lines: ReportLine[]): OrderCounts {
  const orders = new Map<string, { order: NonNullable<ReportLine['order']>; hasLiveLine: boolean }>();
  for (const line of lines) {
    const o = line.order;
    if (!o) continue;
    const live = line.status !== 'cancelled';
    const seen = orders.get(o.id);
    if (seen) seen.hasLiveLine = seen.hasLiveLine || live;
    else orders.set(o.id, { order: o, hasLiveLine: live });
  }
  const counts: OrderCounts = { total: orders.size, completed: 0, cancelled: 0, inProgress: 0, awaitingPayment: 0 };
  for (const { order, hasLiveLine } of orders.values()) {
    if (!hasLiveLine || isWithdrawn(order)) counts.cancelled += 1;
    else if (isDelivered(order.orderStatus)) counts[order.paymentStatus === 'paid' ? 'completed' : 'awaitingPayment'] += 1;
    else counts.inProgress += 1;
  }
  return counts;
}
