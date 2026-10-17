import { allocateDiscount } from './pricing';
import type { DeliveryFeeShare } from './deliveryEarnings';

/**
 * The arithmetic of placing an order, with nothing around it: no database, no clock. createOrder
 * (order-placement.service.ts) reads the cart and the rules, calls these, and writes the result.
 * priceOrder (pricing.ts) then adds the GST and rounds the total.
 */

/** What an order line records once the kitchen's catalog deals are applied to its list price. */
export interface PricedLine {
  unitPrice: number;
  totalPrice: number;
  /** Nuray's commission on the line, at the kitchen's rate. */
  commissionAmount: number;
  /** What the kitchen is paid for the line. */
  sellerPayout: number;
}

/**
 * The charged unit price of every line (`discountedUnitPrices`, in the same order), the line's total, the commission on it
 * and the kitchen's payout, and the order's goods subtotal.
 */
export function priceLines(
  lines: ReadonlyArray<{ quantity: number; commissionRate: unknown }>,
  discountedUnitPrices: readonly number[]
): { lines: PricedLine[]; subtotal: number } {
  let subtotal = 0;
  const priced = lines.map((line, i) => {
    const unitPrice = discountedUnitPrices[i];
    const totalPrice = unitPrice * line.quantity;
    const commissionRate = Number(line.commissionRate) / 100;
    const commissionAmount = totalPrice * commissionRate;
    const sellerPayout = totalPrice - commissionAmount;
    subtotal += totalPrice;
    return { unitPrice, totalPrice, commissionAmount, sellerPayout };
  });
  return { lines: priced, subtotal };
}

/**
 * What a promotion code takes off the part of the order it covers (`eligibleSubtotal`): a percentage, up to the code's cap if
 * it has one, or a fixed amount; never more than the part it covers. The preview of a code (promotion.service.ts) and the
 * order both come here, so the total checkout shows is the total the order charges.
 *
 * A percentage is multiplied first and divided by 100 after: that is exact for a whole-rupee total and a whole percentage
 * (3,500 at 54% is 1,890), where dividing the percentage first leaves a trace in the last place (1,890.0000000000002) that
 * moved a total sitting on a half rupee by one.
 */
export function codeDiscount(
  promotion: { discountType: string; discountValue: unknown; maxDiscountAmount?: unknown },
  eligibleSubtotal: number
): number {
  let discountAmount: number;
  if (promotion.discountType === 'percentage') {
    discountAmount = (eligibleSubtotal * Number(promotion.discountValue)) / 100;
    if (promotion.maxDiscountAmount) {
      discountAmount = Math.min(discountAmount, Number(promotion.maxDiscountAmount));
    }
  } else {
    discountAmount = Number(promotion.discountValue);
  }
  // Never let a discount exceed the part of the order it applies to.
  return Math.min(discountAmount, eligibleSubtotal);
}

/**
 * Each covered line's share of a code's discount, to the cent (so a later partial cancel refunds exactly what the customer
 * paid for that line). A kitchen's own code is funded by the kitchen: its commission and payout are worked out again on what
 * the customer actually pays for the line. A platform code is funded by the platform, so the kitchen's side is unchanged.
 * `lines` are the covered lines only; the result is in the same order.
 */
export function shareCodeDiscount(
  lines: ReadonlyArray<{ totalPrice: number; commissionRate: unknown; commissionAmount: number; sellerPayout: number }>,
  discountAmount: number,
  fundedByKitchen: boolean
): Array<{ promoDiscount: number; commissionAmount: number; sellerPayout: number }> {
  const shares = allocateDiscount(lines.map((l) => ({ total: l.totalPrice })), discountAmount);
  return lines.map((line, idx) => {
    const promoDiscount = shares[idx];
    if (!fundedByKitchen) return { promoDiscount, commissionAmount: line.commissionAmount, sellerPayout: line.sellerPayout };
    const net = line.totalPrice - promoDiscount;
    const commissionAmount = net * (Number(line.commissionRate) / 100);
    return { promoDiscount, commissionAmount, sellerPayout: net - commissionAmount };
  });
}

/** One kitchen's delivery fee for the order, and who priced it. */
export interface KitchenDeliveryFee {
  sellerId: string;
  fee: number;
  /** Priced by Nuray (for a Nuray rider), not by the kitchen's own delivery rules. */
  pricedByPlatform: boolean;
}

/**
 * What the customer pays for delivery, what the kitchens pay Nuray for it, and the per-kitchen record kept on the order. A fee
 * priced by Nuray is for a Nuray rider and is paid by the kitchen (the customer pays nothing for it); a kitchen's own fee is
 * paid by the customer. A kitchen with no fee has no line in the record.
 */
export function splitDeliveryFees(fees: readonly KitchenDeliveryFee[]): {
  deliveryFee: number;
  sellerDeliveryCharge: number;
  breakdown: DeliveryFeeShare[];
} {
  let deliveryFee = 0;
  let sellerDeliveryCharge = 0;
  const breakdown: DeliveryFeeShare[] = [];
  for (const { sellerId, fee, pricedByPlatform } of fees) {
    if (pricedByPlatform) sellerDeliveryCharge += fee;
    else deliveryFee += fee;
    if (fee > 0) {
      breakdown.push({
        sellerId,
        fee,
        provider: pricedByPlatform ? 'platform' : 'self',
        paidBy: pricedByPlatform ? 'seller' : 'customer',
      });
    }
  }
  return { deliveryFee, sellerDeliveryCharge, breakdown };
}
