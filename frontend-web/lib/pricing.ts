/** A catalog deal as the API describes it on a product, cart line or checkout line. */
export interface CatalogPromotionLike {
  type: 'percentage' | 'fixed' | string;
  discountValue: number;
}

/**
 * The price after the kitchen's stacked catalog deals: percentage deals first, then fixed
 * amounts, never below zero, rounded to whole rupees. The server prices the order the same
 * way (see backend promotion.service computeOrderCatalogDiscounts), so what the customer
 * sees on the product, in the cart and at checkout is what they are charged.
 */
export function getStackedDiscountedPrice(originalPrice: number, promos: CatalogPromotionLike[] | undefined | null): number {
  if (!promos?.length) return originalPrice;
  const sorted = [...promos].sort((a, b) =>
    a.type === 'percentage' && b.type === 'fixed' ? -1 : a.type === 'fixed' && b.type === 'percentage' ? 1 : 0
  );
  const result = sorted.reduce((price, p) => {
    if (p.type === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.type === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, originalPrice);
  return Math.round(result);
}
