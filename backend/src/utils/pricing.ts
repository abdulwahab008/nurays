/** GST charged on (subtotal - discount). Used when an order is priced and when a part of it is refunded. */
export const GST_RATE = 0.05;

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

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
