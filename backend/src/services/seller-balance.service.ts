import prisma from '../config/database';
import { selfDeliveryFeeFor, sellerPaidDeliveryFor } from '../utils/deliveryEarnings';
import { collectorOf } from '../utils/paymentCustody';
import { roundMoney } from '../utils/pricing';
import { logger } from '../utils/logger';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Client = typeof prisma | Tx;


export interface SellerBalance {
  /** Seller's share of delivered, paid orders, whoever collected the money. */
  totalEarnings: number;
  /** What the platform owes the seller on orders whose money it (or its riders) collected. */
  platformOwesSeller: number;
  /**
   * What the seller owes the platform on money they collected themselves: commission, the
   * platform's delivery fee, tax, and refunds the platform paid back to customers. Negative
   * when the platform owes them on those orders (e.g. a discount the platform funded).
   */
  sellerOwesPlatform: number;
  /**
   * The seller's share of cash orders whose cash a Nuray rider still holds. It becomes
   * withdrawable (moves into platformOwesSeller) as the rider hands the cash in.
   */
  awaitingRiderCash: number;
  /** Self-delivery fees kept on earned orders (part of totalEarnings). */
  deliveryEarned: number;
  /** Platform delivery fees the kitchen paid out of earned orders (subtracted from totalEarnings). */
  deliveryPaid: number;
  /** Payouts completed. */
  paidOut: number;
  /** What the kitchen paid Nuray itself, recorded by an admin (kitchen-owing.service.ts). */
  paidToNuray: number;
  /** Payouts requested and not yet completed. */
  pendingPayout: number;
  /** What can be withdrawn now. Negative means the seller owes the platform. */
  available: number;
}

/**
 * A seller's balance with the platform, computed from who actually holds each
 * order's money (see utils/paymentCustody.ts).
 *
 * Per order, the seller's entitlement E is their live items' payout (already net
 * of commission and of any discount they funded) plus the delivery fee they keep
 * when they deliver it themselves. Only a delivered order that is still paid
 * earns E; a cancelled or fully refunded one earns nothing.
 *
 *  - platform collected: the platform owes the seller E.
 *  - rider collected: the platform owes the seller E once the rider has handed that cash in;
 *    until then it is shown as awaitingRiderCash.
 *  - seller collected (they hold the full total T): the seller owes T - E. That
 *    covers commission, the platform delivery fee and tax, and also any refund the
 *    platform sent the customer, so the platform is never out of pocket for money
 *    the seller kept. A refund the admin dismissed (not owed) stays with the seller.
 *
 * Orders can only have one seller now; for older multi-seller orders the money
 * went to the first item's seller, who therefore owes the others' share.
 */
/**
 * Which cash orders a rider has handed the money in for. Cash handed in is counted against the
 * rider's cash orders oldest first, so an order is covered once the deposits reach it.
 * Returns the order ids that are covered; an order with no cash entry (old data) counts as covered.
 */
async function ordersWithCashHandedIn(client: Client, orderIds: string[]): Promise<Set<string>> {
  const covered = new Set(orderIds);
  if (orderIds.length === 0) return covered;
  const mine = await client.riderLedgerEntry.findMany({
    where: { orderId: { in: orderIds }, type: 'cod_collected' },
    select: { riderId: true },
    distinct: ['riderId'],
  });
  for (const { riderId } of mine) {
    const [collected, deposits] = await Promise.all([
      client.riderLedgerEntry.findMany({
        where: { riderId, type: 'cod_collected' },
        select: { orderId: true, amount: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      client.riderLedgerEntry.aggregate({ where: { riderId, type: 'cash_deposit' }, _sum: { amount: true } }),
    ]);
    const deposited = Number(deposits._sum.amount ?? 0);
    let running = 0;
    for (const entry of collected) {
      running += Math.abs(Number(entry.amount));
      if (entry.orderId && running > deposited + 0.005) covered.delete(entry.orderId);
    }
  }
  return covered;
}

/**
 * One order as the balance needs it: the order's own fields, with its lines and refunds already summed in the database
 * for this kitchen. A kitchen with tens of thousands of orders used to send every line and every refund row across to be
 * added up here; now it is one row per order.
 */
export interface BalanceOrder {
  id: string;
  orderNumber: string;
  placedAt: Date;
  deliveredAt: Date | null;
  totalAmount: number;
  paymentMethod: string;
  paymentCollectedBy: string | null;
  paymentStatus: string;
  /** The order has a paidAt (the money was confirmed at some point). */
  paidAt: boolean;
  orderStatus: string;
  deliveryType: string;
  deliveryProvider: string | null;
  deliveryFeeBreakdown: unknown;
  /** Payout of this kitchen's lines that are not cancelled. */
  livePayout: number;
  /** The seller of the order's first line (oldest, then by id): the payee of an older multi-seller order. */
  firstSellerId: string | null;
  refundsFailed: number;
  refundsCompleted: number;
}

/**
 * The orders that matter to a kitchen's balance: delivered ones (earned if still paid, or refunded after delivery), and
 * cancelled ones whose money was collected or refunded.
 */
async function balanceOrders(client: Client, sellerId: string): Promise<BalanceOrder[]> {
  const rows = await client.$queryRaw<
    Array<{
      id: string;
      order_number: string;
      created_at: Date;
      delivered_at: Date | null;
      total_amount: number;
      payment_method: string;
      payment_collected_by: string | null;
      payment_status: string;
      has_paid_at: boolean;
      order_status: string;
      delivery_type: string;
      delivery_provider: string | null;
      delivery_fee_breakdown: unknown;
      live_payout: number;
      first_seller_id: string | null;
      refunds_failed: number;
      refunds_completed: number;
    }>
  >`
    WITH mine AS (
      SELECT order_id, COALESCE(SUM(seller_payout) FILTER (WHERE status <> 'cancelled'), 0)::float8 AS live_payout
      FROM order_items
      WHERE seller_id = ${sellerId}
      GROUP BY order_id
    )
    SELECT
      o.id,
      o.order_number,
      o.created_at,
      o.delivered_at,
      o.total_amount::float8 AS total_amount,
      o.payment_method,
      o.payment_collected_by,
      o.payment_status,
      (o.paid_at IS NOT NULL) AS has_paid_at,
      o.order_status,
      o.delivery_type,
      o.delivery_provider,
      o.delivery_fee_breakdown,
      mine.live_payout,
      (SELECT f.seller_id FROM order_items f WHERE f.order_id = o.id ORDER BY f.created_at ASC, f.id ASC LIMIT 1) AS first_seller_id,
      COALESCE(r.failed, 0)::float8 AS refunds_failed,
      COALESCE(r.completed, 0)::float8 AS refunds_completed
    FROM mine
    JOIN orders o ON o.id = mine.order_id
    LEFT JOIN LATERAL (
      SELECT SUM(x.amount) FILTER (WHERE x.status = 'failed') AS failed, SUM(x.amount) FILTER (WHERE x.status = 'completed') AS completed
      FROM refunds x
      WHERE x.order_id = o.id
    ) r ON true
    WHERE (o.order_status IN ('delivered', 'completed') AND o.payment_status IN ('paid', 'refund_pending', 'refunded'))
       OR (o.order_status IN ('cancelled', 'refunded')
           AND (o.paid_at IS NOT NULL OR EXISTS (SELECT 1 FROM refunds c WHERE c.order_id = o.id AND c.status = 'completed')))
  `;
  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    placedAt: r.created_at,
    deliveredAt: r.delivered_at,
    totalAmount: Number(r.total_amount),
    paymentMethod: r.payment_method,
    paymentCollectedBy: r.payment_collected_by,
    paymentStatus: r.payment_status,
    paidAt: r.has_paid_at,
    orderStatus: r.order_status,
    deliveryType: r.delivery_type,
    deliveryProvider: r.delivery_provider,
    deliveryFeeBreakdown: r.delivery_fee_breakdown,
    livePayout: Number(r.live_payout),
    firstSellerId: r.first_seller_id,
    refundsFailed: Number(r.refunds_failed),
    refundsCompleted: Number(r.refunds_completed),
  }));
}

/** Who held an order's money, as a statement line says it. */
export type LineKind = 'online' | 'rider_cash' | 'rider_cash_waiting' | 'kitchen_collected';

/** One order's part in a kitchen's balance. */
export interface BalanceLine {
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  deliveredAt: Date | null;
  kind: LineKind;
  /** What the order customer paid. */
  orderTotal: number;
  /** The kitchen's share: its lines' payout (net of commission) plus the delivery fee it keeps, minus the one it pays. 0 unless earned. */
  kitchenShare: number;
  /** What the order adds to (positive) or takes from (negative) the money Nuray owes the kitchen. */
  effect: number;
}

/**
 * The balance reads every order the kitchen has had (PERF-1): about 0.36 s at 20,000 orders. A stored running total
 * would bound it, at the cost of a second copy of the money to keep right, so it waits until a real kitchen needs it
 * (decided 26 October 2026). This is how we will know: a balance that takes longer than this is logged.
 */
export const SLOW_BALANCE_MS = 1_000;

/** Every order's part in the kitchen's balance, with the totals computeSellerBalance reports. */
export async function sellerBalanceLines(client: Client, sellerId: string) {
  const started = Date.now();
  const orders = await balanceOrders(client, sellerId);

  const cashByRider = orders
    .filter((o) => (o.orderStatus === 'delivered' || o.orderStatus === 'completed') && o.paymentStatus === 'paid' && collectorOf(o) === 'rider')
    .map((o) => o.id);
  const cashHandedIn = await ordersWithCashHandedIn(client, cashByRider);

  let totalEarnings = 0;
  let deliveryEarned = 0;
  let deliveryPaid = 0;
  let awaitingRiderCash = 0;
  let platformOwesSeller = 0;
  let sellerOwesPlatform = 0;
  const lines: BalanceLine[] = [];

  for (const o of orders) {
    const delivered = o.orderStatus === 'delivered' || o.orderStatus === 'completed';
    const earned = delivered && o.paymentStatus === 'paid';
    const kept = earned ? selfDeliveryFeeFor(o.deliveryFeeBreakdown, sellerId) : 0;
    const paid = earned ? sellerPaidDeliveryFor(o.deliveryFeeBreakdown, sellerId) : 0;
    const entitlement = earned ? o.livePayout + kept - paid : 0;
    if (earned) {
      totalEarnings += entitlement;
      deliveryEarned += kept;
      deliveryPaid += paid;
    }
    const line = { orderId: o.id, orderNumber: o.orderNumber, placedAt: o.placedAt, deliveredAt: o.deliveredAt, orderTotal: o.totalAmount, kitchenShare: roundMoney(entitlement) };

    if (collectorOf(o) !== 'seller') {
      // A rider's cash order is paid out once the rider has handed that cash in.
      if (earned && collectorOf(o) === 'rider' && !cashHandedIn.has(o.id)) {
        awaitingRiderCash += entitlement;
        lines.push({ ...line, kind: 'rider_cash_waiting', effect: 0 });
      } else {
        platformOwesSeller += entitlement;
        lines.push({ ...line, kind: collectorOf(o) === 'rider' ? 'rider_cash' : 'online', effect: roundMoney(entitlement) });
      }
      continue;
    }

    const isPayee = o.firstSellerId === sellerId;
    let collected = 0;
    let keptRefunds = 0;
    if (isPayee) {
      if (o.paidAt) {
        collected = o.totalAmount;
        keptRefunds = o.refundsFailed;
      } else {
        // Never confirmed by the seller, yet the platform refunded the customer
        // after checking the transfer had arrived: recover what it paid out.
        collected = o.refundsCompleted;
      }
    }
    const owed = collected - entitlement - keptRefunds;
    sellerOwesPlatform += owed;
    lines.push({ ...line, kind: 'kitchen_collected', effect: roundMoney(-owed) });
  }

  const ms = Date.now() - started;
  if (ms > SLOW_BALANCE_MS) {
    logger.warn({ sellerId, orders: orders.length, ms }, 'Kitchen balance took over a second: time to build the running total (PERF-1)');
  }

  return { lines, totalEarnings, deliveryEarned, deliveryPaid, awaitingRiderCash, platformOwesSeller, sellerOwesPlatform };
}

export async function computeSellerBalance(client: Client, sellerId: string): Promise<SellerBalance> {
  const { totalEarnings, deliveryEarned, deliveryPaid, awaitingRiderCash, platformOwesSeller, sellerOwesPlatform } = await sellerBalanceLines(client, sellerId);

  const payouts = await client.sellerPayout.findMany({
    where: { sellerId, status: { in: ['completed', 'pending', 'processing'] } },
    select: { netAmount: true, status: true },
  });
  // A payment the kitchen made to Nuray is kept as a completed payout with a negative amount.
  const paidOut = payouts.filter((p) => p.status === 'completed' && Number(p.netAmount) > 0).reduce((s, p) => s + Number(p.netAmount), 0);
  const paidToNuray = -payouts.filter((p) => p.status === 'completed' && Number(p.netAmount) < 0).reduce((s, p) => s + Number(p.netAmount), 0);
  const pendingPayout = payouts.filter((p) => p.status !== 'completed').reduce((s, p) => s + Number(p.netAmount), 0);

  return {
    totalEarnings: roundMoney(totalEarnings),
    platformOwesSeller: roundMoney(platformOwesSeller),
    sellerOwesPlatform: roundMoney(sellerOwesPlatform),
    awaitingRiderCash: roundMoney(awaitingRiderCash),
    deliveryEarned: roundMoney(deliveryEarned),
    deliveryPaid: roundMoney(deliveryPaid),
    paidOut: roundMoney(paidOut),
    paidToNuray: roundMoney(paidToNuray),
    pendingPayout: roundMoney(pendingPayout),
    available: roundMoney(platformOwesSeller - sellerOwesPlatform - paidOut - pendingPayout + paidToNuray),
  };
}
