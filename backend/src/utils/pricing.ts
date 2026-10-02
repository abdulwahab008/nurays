/** GST charged on (subtotal - discount). Used when an order is priced and when a part of it is refunded. */
export const GST_RATE = 0.05;

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

/**
 * An order's GST and total. GST is charged on the goods after discounts; the total is then
 * rounded to whole rupees (cash has no paisa, and the customer, rider and kitchen must all see
 * the same amount), and the GST line takes that rounding, always under Rs 0.50.
 * frontend-web/lib/utils.ts orderTotals() mirrors this for checkout.
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
