/**
 * What the cart and checkout add up for an order. The server prices an order the same way (backend utils/pricing.ts,
 * priceOrder), so the total shown is the total charged; backend/tests/web-parity.test.ts fails when the two differ.
 * No imports, so that test (and `npm test`) can read it as it is.
 */

/** GST on the goods after discounts. */
export const GST_RATE = 0.05;

/**
 * GST and total exactly as the server prices an order:
 * GST on the goods after discounts, the total rounded to whole rupees, GST taking the rounding.
 */
export function orderTotals(goodsAfterDiscount: number, deliveryFee: number): { gst: number; total: number } {
  const goods = Math.max(0, goodsAfterDiscount);
  const total = Math.round(goods + deliveryFee + goods * GST_RATE);
  const gst = Math.round((total - goods - deliveryFee) * 100) / 100;
  if (gst < 0) return { gst: 0, total: Math.round((goods + deliveryFee) * 100) / 100 };
  return { gst, total };
}
