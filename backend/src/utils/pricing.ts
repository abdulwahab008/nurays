/** GST charged on (subtotal - discount). Used when an order is priced and when a part of it is refunded. */
export const GST_RATE = 0.05;

/** An amount to whole paisa (Rs 0.01), so sums of prices carry no float dust. Never -0. */
export const roundMoney = (n: number): number => {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

/**
 * An order's GST and total. GST is charged on the goods after discounts; the total is then
 * rounded to whole rupees (cash has no paisa, and the customer, rider and kitchen must all see
 * the same amount), and the GST line takes that rounding, always under Rs 0.50.
 * frontend-web/lib/order-totals.ts orderTotals() mirrors this for checkout (backend/tests/web-parity.test.ts fails when they differ).
 */
export function priceOrder(goodsAfterDiscount: number, deliveryFee: number): { taxAmount: number; totalAmount: number } {
  const goods = Math.max(0, goodsAfterDiscount);
  const totalAmount = Math.round(goods + deliveryFee + goods * GST_RATE);
  const taxAmount = roundMoney(totalAmount - goods - deliveryFee);
  if (taxAmount < 0) return { taxAmount: 0, totalAmount: roundMoney(goods + deliveryFee) };
  return { taxAmount, totalAmount };
}

/**
 * Split a discount over the items it applies to, in proportion to their totals, to the cent
 * (the last item takes the rounding remainder so the parts always sum to the discount).
 */
export function allocateDiscount(items: Array<{ total: number }>, discount: number): number[] {
  const base = items.reduce((sum, i) => sum + i.total, 0);
  if (items.length === 0 || base <= 0 || discount <= 0) return items.map(() => 0);
  let allocated = 0;
  return items.map((item, idx) => {
    if (idx === items.length - 1) return roundMoney(discount - allocated);
    const part = roundMoney((item.total / base) * discount);
    allocated += part;
    return part;
  });
}

/**
 * Stack multiple catalog discounts onto a base price, percentage discounts
 * first then fixed amounts — must stay byte-for-byte identical to the
 * frontend's getStackedDiscountedPrice (checkout/cart/product pages) so the
 * price a customer sees always matches what they're actually charged.
 * backend/tests/web-parity.test.ts fails when the two differ.
 */
export function applyStackedDiscount(
  basePrice: number,
  promos: Array<{ discountType: string; discountValue: number }>
): number {
  if (!promos?.length) return basePrice;
  const sorted = [...promos].sort((a, b) =>
    a.discountType === 'percentage' && b.discountType === 'fixed'
      ? -1
      : a.discountType === 'fixed' && b.discountType === 'percentage'
        ? 1
        : 0
  );
  const result = sorted.reduce((price, p) => {
    if (p.discountType === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.discountType === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, basePrice);
  return Math.round(result);
}
