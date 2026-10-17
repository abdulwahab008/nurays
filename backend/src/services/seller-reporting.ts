/**
 * The definitions the kitchen's dashboard and its analytics screen both report on, in one
 * place so the same day can't show two different numbers under the same word.
 *
 * "Earned" matches the ledger (seller-balance.service.ts): a line counts only once the order
 * actually arrived AND the money is still ours — a cancelled line, a cancelled order or one
 * refunded back to the customer has earned the kitchen nothing. What an earned order is worth
 * is also the ledger's: the payout of the kitchen's live lines, plus the delivery fee it kept
 * (it delivered itself), minus the one it pays Nuray for a rider. So "today's earnings" is what
 * the ledger will credit for today's orders, and every screen adds up to the net earnings.
 */
import { roundMoney } from '../utils/pricing';
import { selfDeliveryFeeFor, sellerPaidDeliveryFor } from '../utils/deliveryEarnings';

export interface ReportOrder {
  id: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt: Date;
  /** Who charges and who pays each kitchen's delivery fee on this order (utils/deliveryEarnings.ts). */
  deliveryFeeBreakdown?: unknown;
}

export interface ReportLine {
  status: string;
  quantity: number;
  sellerPayout: unknown;
  order: ReportOrder | null;
}

const isDelivered = (orderStatus: string) => orderStatus === 'delivered' || orderStatus === 'completed';
/** The whole order went back to the customer: cancelled, or refunded in full (before or after it arrived). */
const isWithdrawn = (o: { orderStatus: string; paymentStatus: string }) =>
  o.orderStatus === 'cancelled' ||
  o.orderStatus === 'refunded' ||
  o.orderStatus === 'refund_pending' ||
  o.paymentStatus === 'refund_pending' ||
  o.paymentStatus === 'refunded';
/** The ledger's rule for an order that has earned: it arrived and the money is still ours. */
const orderEarned = (o: { orderStatus: string; paymentStatus: string }) => isDelivered(o.orderStatus) && o.paymentStatus === 'paid';

export function isEarned(line: ReportLine): boolean {
  const o = line.order;
  return line.status !== 'cancelled' && !!o && isDelivered(o.orderStatus) && o.paymentStatus === 'paid';
}

/** One order that has earned, as the kitchen's share of it is made up. */
export interface EarnedOrder {
  id: string;
  createdAt: Date;
  /** Payout of the kitchen's live lines on this order: net of commission and of discounts it funded. */
  dishes: number;
  /** Units of food on those lines. */
  unitsSold: number;
  /** The delivery fee the kitchen keeps (it delivers itself). */
  deliveryKept: number;
  /** The delivery fee the kitchen pays Nuray for a rider (taken from its payout). */
  deliveryPaid: number;
}

/** What the order earned the kitchen: dishes + delivery kept - delivery paid (the ledger's entitlement for it). */
export const earningsOf = (e: EarnedOrder): number => e.dishes + e.deliveryKept - e.deliveryPaid;

/**
 * The orders that have earned, one entry each however many of the kitchen's lines they hold, so a delivery fee is
 * counted once per order, never once per dish. Like the ledger, an earned order counts for its delivery fee even
 * when none of the kitchen's own lines is left on it.
 */
export function earnedOrders(lines: ReportLine[], sellerId: string): EarnedOrder[] {
  const orders = new Map<string, EarnedOrder>();
  for (const line of lines) {
    const o = line.order;
    if (!o || !orderEarned(o)) continue;
    let earned = orders.get(o.id);
    if (!earned) {
      earned = {
        id: o.id,
        createdAt: o.createdAt,
        dishes: 0,
        unitsSold: 0,
        deliveryKept: selfDeliveryFeeFor(o.deliveryFeeBreakdown, sellerId),
        deliveryPaid: sellerPaidDeliveryFor(o.deliveryFeeBreakdown, sellerId),
      };
      orders.set(o.id, earned);
    }
    if (line.status !== 'cancelled') {
      earned.dishes += Number(line.sellerPayout);
      earned.unitsSold += line.quantity;
    }
  }
  return [...orders.values()];
}

export interface PeriodTotals {
  /**
   * Orders placed in the period that are still alive for the kitchen: every order but the cancelled and the
   * refunded ones, so a kitchen with orders being cooked does not see none. Distinct orders, never lines or units.
   */
  orders: number;
  /** Units of food sold on the orders that earned. Counted separately from money, and never called "sales". */
  unitsSold: number;
  /**
   * What the kitchen earned on the orders placed in the period that have earned (delivered and still paid): its
   * dishes' payout, plus the delivery fee it kept, minus the one it paid Nuray. Net of commission and discounts.
   */
  revenue: number;
  /** Of which the dishes alone, before the delivery fee kept or paid. */
  dishes: number;
}

export function periodTotals(lines: ReportLine[], since: Date, sellerId: string): PeriodTotals {
  const inPeriod = lines.filter((line) => line.order && line.order.createdAt >= since);
  const earned = earnedOrders(inPeriod, sellerId);
  const counts = orderCounts(inPeriod);
  return {
    orders: counts.total - counts.cancelled,
    unitsSold: earned.reduce((sum, e) => sum + e.unitsSold, 0),
    revenue: roundMoney(earned.reduce((sum, e) => sum + earningsOf(e), 0)),
    dishes: roundMoney(earned.reduce((sum, e) => sum + e.dishes, 0)),
  };
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
