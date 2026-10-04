import prisma from '../config/database';
import { selfDeliveryFeeFor } from '../utils/deliveryEarnings';
import { collectorOf } from '../utils/paymentCustody';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Client = typeof prisma | Tx;

const money = (n: number) => Math.round(n * 100) / 100;

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
  /** Payouts completed. */
  paidOut: number;
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
 *  - platform / rider collected: the platform owes the seller E.
 *  - seller collected (they hold the full total T): the seller owes T - E. That
 *    covers commission, the platform delivery fee and tax, and also any refund the
 *    platform sent the customer, so the platform is never out of pocket for money
 *    the seller kept. A refund the admin dismissed (not owed) stays with the seller.
 *
 * Orders can only have one seller now; for older multi-seller orders the money
 * went to the first item's seller, who therefore owes the others' share.
 */
export async function computeSellerBalance(client: Client, sellerId: string): Promise<SellerBalance> {
  const orders = await client.order.findMany({
    where: {
      items: { some: { sellerId } },
      OR: [
        // Delivered: earned (if still paid), or fully refunded after delivery.
        { orderStatus: { in: ['delivered', 'completed'] }, paymentStatus: { in: ['paid', 'refund_pending', 'refunded'] } },
        // Cancelled after the money was collected: the refund decides who is owed what.
        { orderStatus: { in: ['cancelled', 'refunded'] }, OR: [{ paidAt: { not: null } }, { refunds: { some: { status: 'completed' } } }] },
      ],
    },
    select: {
      id: true,
      totalAmount: true,
      paymentMethod: true,
      paymentCollectedBy: true,
      paymentStatus: true,
      paidAt: true,
      orderStatus: true,
      deliveryType: true,
      deliveryProvider: true,
      deliveryFeeBreakdown: true,
      items: {
        select: { sellerId: true, status: true, sellerPayout: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      refunds: { select: { amount: true, status: true } },
    },
  });

  let totalEarnings = 0;
  let platformOwesSeller = 0;
  let sellerOwesPlatform = 0;

  for (const o of orders) {
    const delivered = o.orderStatus === 'delivered' || o.orderStatus === 'completed';
    const earned = delivered && o.paymentStatus === 'paid';
    const entitlement = earned
      ? o.items
          .filter((i) => i.sellerId === sellerId && i.status !== 'cancelled')
          .reduce((sum, i) => sum + Number(i.sellerPayout), 0) + selfDeliveryFeeFor(o.deliveryFeeBreakdown, sellerId)
      : 0;
    if (earned) totalEarnings += entitlement;

    if (collectorOf(o) !== 'seller') {
      platformOwesSeller += entitlement;
      continue;
    }

    const isPayee = o.items[0]?.sellerId === sellerId;
    let collected = 0;
    let keptRefunds = 0;
    if (isPayee) {
      if (o.paidAt) {
        collected = Number(o.totalAmount);
        keptRefunds = o.refunds.filter((r) => r.status === 'failed').reduce((s, r) => s + Number(r.amount), 0);
      } else {
        // Never confirmed by the seller, yet the platform refunded the customer
        // after checking the transfer had arrived: recover what it paid out.
        collected = o.refunds.filter((r) => r.status === 'completed').reduce((s, r) => s + Number(r.amount), 0);
      }
    }
    sellerOwesPlatform += collected - entitlement - keptRefunds;
  }

  const payouts = await client.sellerPayout.findMany({
    where: { sellerId, status: { in: ['completed', 'pending', 'processing'] } },
    select: { netAmount: true, status: true },
  });
  const paidOut = payouts.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.netAmount), 0);
  const pendingPayout = payouts.filter((p) => p.status !== 'completed').reduce((s, p) => s + Number(p.netAmount), 0);

  return {
    totalEarnings: money(totalEarnings),
    platformOwesSeller: money(platformOwesSeller),
    sellerOwesPlatform: money(sellerOwesPlatform),
    paidOut: money(paidOut),
    pendingPayout: money(pendingPayout),
    available: money(platformOwesSeller - sellerOwesPlatform - paidOut - pendingPayout),
  };
}
