import { roundMoney } from './pricing';

/**
 * A refund made after an order was delivered gives back part of what was sold, never the delivery fee. It is shared in
 * proportion: the kitchen's earnings on the dishes, Nuray's commission and the GST all shrink by the same fraction, and so
 * does a discount Nuray paid for. The delivery fees (kept by a self-delivering kitchen, or paid to Nuray) do not change.
 */

/** What the order's dishes and tax were posted as, before any refund after delivery. */
export interface RefundBase {
  sellerEarning: number;
  commission: number;
  gst: number;
  /** A discount Nuray paid for (what keeps the books level when the customer paid less). */
  platformDiscount: number;
}

/** The part of the order a refund after delivery can give back: everything the customer paid except the delivery fee. */
export const refundableBase = (b: RefundBase) => roundMoney(b.sellerEarning + b.commission + b.gst - b.platformDiscount);

/** The fraction of the dishes and tax that `refunded` gives back, from 0 to 1. */
export function refundFraction(refunded: number, base: number): number {
  return base > 0 && refunded > 0 ? Math.min(1, refunded / base) : 0;
}

/**
 * How `refunded` (all refunds after delivery so far) comes off each part. The parts add up to exactly what was refunded
 * (capped at the base), the commission taking the rounding, so ledger entries made from them always balance.
 */
export function splitRefund(refunded: number, b: RefundBase) {
  const base = refundableBase(b);
  const f = refundFraction(refunded, base);
  const refund = roundMoney(Math.min(refunded, base));
  const sellerEarning = roundMoney(b.sellerEarning * f);
  const gst = roundMoney(b.gst * f);
  const platformDiscount = roundMoney(b.platformDiscount * f);
  return { refund, sellerEarning, gst, platformDiscount, commission: roundMoney(refund - sellerEarning - gst + platformDiscount) };
}
