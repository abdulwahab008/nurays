/** A catalog deal as the API describes it on a product, cart line or checkout line. */
export interface CatalogPromotionLike {
  type: 'percentage' | 'fixed' | string;
  discountValue: number;
  name?: string;
  /** The deal applies only when the kitchen's goods in the tray, at menu prices, reach this amount. */
  minOrderAmount?: number;
  /** The most the deal takes off one order (all its lines together); null or 0 when it has no cap. */
  maxDiscountAmount?: number | null;
}

/** One line of a tray, with the deals the API lists for its dish. */
export interface DealLine<P extends CatalogPromotionLike & { id: string }> {
  sellerId: string;
  unitPrice: number;
  quantity: number;
  promos: P[];
}

/** A page's translator, narrowed to the three words a deal's label needs (every page that shows deals has them). */
export type PromotionText = (key: 'percentOff' | 'amountOff' | 'deal', vars?: Record<string, string | number>) => string;

/** What a deal is worth, in words: "10% off", "Rs 200 off", or the deal's own name (a bundle, buy-x-get-y) when it has no size to show. */
export function getPromotionLabel(p: CatalogPromotionLike, t: PromotionText, formatAmount: (amount: number) => string): string {
  if (p.type === 'percentage' && p.discountValue > 0) return t('percentOff', { value: p.discountValue });
  if (p.type === 'fixed' && p.discountValue > 0) return t('amountOff', { amount: formatAmount(p.discountValue) });
  return p.name || t('deal');
}

/** What each deal takes off one unit, in the order given: percentages are taken first, then fixed amounts, never more than is left. */
function unitReductions(basePrice: number, promos: ReadonlyArray<CatalogPromotionLike>): number[] {
  const reductions = promos.map(() => 0);
  let price = basePrice;
  for (const type of ['percentage', 'fixed']) {
    promos.forEach((promo, i) => {
      if (promo.type !== type || !(promo.discountValue > 0)) return;
      reductions[i] = type === 'percentage' ? (price * promo.discountValue) / 100 : Math.min(price, promo.discountValue);
      price -= reductions[i];
    });
  }
  return reductions;
}

/**
 * The unit price of every line of a tray after the kitchens' menu deals, and the deals that took something off each line.
 * A deal with a minimum order counts only when that kitchen's goods reach it; a deal with a cap takes at most the cap off
 * the whole order (each line's share is scaled down to whole rupees); a discounted unit never costs less than Rs 1.
 * The server prices the order with the same sum (backend utils/pricing.ts priceDealLines), so what the cart and checkout
 * show is what the customer is charged. backend/tests/web-parity.test.ts fails when the two differ.
 */
export function priceDealLines<P extends CatalogPromotionLike & { id: string }>(
  lines: ReadonlyArray<DealLine<P>>
): { unitPrices: number[]; applied: P[][] } {
  const kitchenGoods = new Map<string, number>();
  for (const line of lines) {
    kitchenGoods.set(line.sellerId, (kitchenGoods.get(line.sellerId) ?? 0) + line.unitPrice * line.quantity);
  }
  const inForce = lines.map((line) => line.promos.filter((p) => !((p.minOrderAmount ?? 0) > (kitchenGoods.get(line.sellerId) ?? 0))));
  const reductions = lines.map((line, i) => unitReductions(line.unitPrice, inForce[i]));

  const taken = new Map<string, number>();
  lines.forEach((line, i) => {
    inForce[i].forEach((p, j) => {
      // A capped deal is counted in the whole rupees it takes off a unit (a half goes down, as the unit price goes up),
      // so the cap is compared with what is charged, not with the sum before rounding.
      if (p.maxDiscountAmount) reductions[i][j] = Math.max(0, Math.ceil(reductions[i][j] - 0.5));
      taken.set(p.id, (taken.get(p.id) ?? 0) + reductions[i][j] * line.quantity);
    });
  });
  lines.forEach((_, i) => {
    inForce[i].forEach((p, j) => {
      const total = taken.get(p.id) ?? 0;
      if (p.maxDiscountAmount && total > p.maxDiscountAmount) {
        reductions[i][j] = Math.floor((reductions[i][j] * p.maxDiscountAmount) / total);
      }
    });
  });

  const unitPrices = lines.map((line, i) => {
    const off = reductions[i].reduce((sum, r) => sum + r, 0);
    return off > 0 ? Math.max(Math.min(1, line.unitPrice), Math.round(line.unitPrice - off)) : line.unitPrice;
  });
  return { unitPrices, applied: inForce.map((promos, i) => promos.filter((_, j) => reductions[i][j] > 0)) };
}

/** priceDealLines for the tray the cart API returns: each line at its option's (or dish's) menu price, with the deals listed for its dish. */
export function priceTray<P extends CatalogPromotionLike & { id: string }>(
  items: ReadonlyArray<{ quantity: number; product: { id: string; price: number }; variant?: { price: number } | null; seller: { id: string } }>,
  promotions: Record<string, P[]>
): { unitPrices: number[]; applied: P[][] } {
  return priceDealLines(
    items.map((item) => ({
      sellerId: item.seller.id,
      unitPrice: item.variant?.price ?? item.product.price,
      quantity: item.quantity,
      promos: promotions[item.product.id] ?? [],
    }))
  );
}

/**
 * The price of one unit of a dish ordered by itself, after its kitchen's deals: priceDealLines for a one-line, one-unit
 * order. For the pages that show a dish outside a tray; the cart and checkout price the whole tray with priceDealLines.
 */
export function getStackedDiscountedPrice(originalPrice: number, promos: CatalogPromotionLike[] | undefined | null): number {
  if (!promos?.length) return originalPrice;
  return priceDealLines([
    { sellerId: '', unitPrice: originalPrice, quantity: 1, promos: promos.map((p, i) => ({ ...p, id: String(i) })) },
  ]).unitPrices[0];
}

/** The deals that take something off one unit of a dish ordered by itself: the ones a dish's own page or card may show. */
export function dealsOnOneUnit<P extends CatalogPromotionLike & { id: string }>(price: number, promos: P[] | undefined | null): P[] {
  if (!promos?.length) return [];
  return priceDealLines([{ sellerId: '', unitPrice: price, quantity: 1, promos }]).applied[0];
}
