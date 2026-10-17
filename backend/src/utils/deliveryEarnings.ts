/**
 * Who a delivery fee belongs to.
 *
 * An order's delivery fee is the sum of what each seller in it charges. For a
 * seller on the platform fleet that fee pays for the platform's riders (platform
 * revenue). A self-delivering seller does the delivery themselves, so their fee
 * is theirs and the platform takes no cut. The split is snapshotted on the order
 * at creation (Order.deliveryFeeBreakdown) so later changes to a seller's
 * delivery provider don't rewrite history.
 *
 * Who pays: for a Nuray rider's delivery the KITCHEN pays Nuray the fee (paidBy 'seller': taken
 * from the kitchen's payout, nothing added to the customer's bill). A self-delivering kitchen's fee
 * is charged to the customer and kept by the kitchen (paidBy 'customer').
 */

import { roundMoney } from './pricing';

export interface DeliveryFeeShare {
  sellerId: string;
  fee: number;
  provider: 'platform' | 'self';
  /** Who pays the fee: the kitchen (Nuray rider) or the customer (self-delivery; older orders). */
  paidBy?: 'seller' | 'customer';
}

export function parseBreakdown(raw: unknown): DeliveryFeeShare[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      sellerId: String(r.sellerId ?? ''),
      fee: Number(r.fee) || 0,
      provider: (r.provider === 'self' ? 'self' : 'platform') as 'platform' | 'self',
      paidBy: (r.paidBy === 'seller' ? 'seller' : 'customer') as 'seller' | 'customer',
    }))
    .filter((r) => r.sellerId && r.fee > 0);
}

/** The delivery fee a self-delivering seller keeps on this order. */
export function selfDeliveryFeeFor(breakdown: unknown, sellerId: string): number {
  return roundMoney(
    parseBreakdown(breakdown)
      .filter((r) => r.provider === 'self' && r.sellerId === sellerId)
      .reduce((sum, r) => sum + r.fee, 0)
  );
}

/** What a kitchen pays Nuray for the rider delivery of this order (taken from its payout). */
export function sellerPaidDeliveryFor(breakdown: unknown, sellerId: string): number {
  return roundMoney(
    parseBreakdown(breakdown)
      .filter((r) => r.paidBy === 'seller' && r.sellerId === sellerId)
      .reduce((sum, r) => sum + r.fee, 0)
  );
}

/** The part of the order's delivery fee that is platform revenue (everything not kept by a self-delivering seller). */
export function platformDeliveryFee(deliveryFee: number, breakdown: unknown): number {
  const selfTotal = parseBreakdown(breakdown)
    .filter((r) => r.provider === 'self')
    .reduce((sum, r) => sum + r.fee, 0);
  return roundMoney(Math.max(0, deliveryFee - selfTotal));
}

/**
 * Self-delivery fees a seller has earned across orders, counted once per order
 * (items repeat an order). `onlineOnly` restricts to orders the platform
 * collected the money for: a COD delivery fee was handed to the seller at the
 * door along with the goods, so it is not payable again.
 */
export function sumSelfDeliveryFees(
  orders: Array<{ id: string; deliveryFeeBreakdown: unknown; paymentMethod: string }>,
  sellerId: string,
  opts: { onlineOnly: boolean }
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const o of orders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (opts.onlineOnly && o.paymentMethod === 'cod') continue;
    total += selfDeliveryFeeFor(o.deliveryFeeBreakdown, sellerId);
  }
  return roundMoney(total);
}
