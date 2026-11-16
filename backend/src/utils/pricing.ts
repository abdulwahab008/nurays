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

/** A kitchen's menu deal as the order prices it. */
export interface CatalogDeal {
  id: string;
  discountType: string;
  discountValue: number;
  /** The deal applies only when the kitchen's goods in the order, at menu prices, reach this amount. */
  minOrderAmount: number;
  /** The most the deal takes off one order (all its lines together); null or 0 when it has no cap. */
  maxDiscountAmount: number | null;
}

export interface CatalogDealLine {
  sellerId: string;
  unitPrice: number;
  quantity: number;
  deals: CatalogDeal[];
}

/** What each deal takes off one unit, in the order given: percentages are taken first, then fixed amounts, never more than is left. */
function unitReductions(basePrice: number, deals: ReadonlyArray<{ discountType: string; discountValue: number }>): number[] {
  const reductions = deals.map(() => 0);
  let price = basePrice;
  for (const type of ['percentage', 'fixed']) {
    deals.forEach((deal, i) => {
      if (deal.discountType !== type || !(deal.discountValue > 0)) return;
      reductions[i] = type === 'percentage' ? (price * deal.discountValue) / 100 : Math.min(price, deal.discountValue);
      price -= reductions[i];
    });
  }
  return reductions;
}

/**
 * The unit price of every line of an order after the kitchens' menu deals, and the deals that took something off each line.
 * A deal with a minimum order counts only when that kitchen's goods reach it; a deal with a cap takes at most the cap off
 * the whole order (each line's share is scaled down to whole rupees); a discounted unit never costs less than Rs 1.
 * frontend-web/lib/pricing.ts priceDealLines() is the same sum for the cart and checkout pages, so the price a customer
 * sees is the price charged. backend/tests/web-parity.test.ts fails when the two differ.
 */
export function priceDealLines(lines: ReadonlyArray<CatalogDealLine>): { unitPrices: number[]; applied: CatalogDeal[][] } {
  const kitchenGoods = new Map<string, number>();
  for (const line of lines) {
    kitchenGoods.set(line.sellerId, (kitchenGoods.get(line.sellerId) ?? 0) + line.unitPrice * line.quantity);
  }
  const inForce = lines.map((line) => line.deals.filter((d) => !(d.minOrderAmount > (kitchenGoods.get(line.sellerId) ?? 0))));
  const reductions = lines.map((line, i) => unitReductions(line.unitPrice, inForce[i]));

  const taken = new Map<string, number>();
  lines.forEach((line, i) => {
    inForce[i].forEach((d, j) => {
      // A capped deal is counted in the whole rupees it takes off a unit (a half goes down, as the unit price goes up),
      // so the cap is compared with what is charged, not with the sum before rounding.
      if (d.maxDiscountAmount) reductions[i][j] = Math.max(0, Math.ceil(reductions[i][j] - 0.5));
      taken.set(d.id, (taken.get(d.id) ?? 0) + reductions[i][j] * line.quantity);
    });
  });
  lines.forEach((_, i) => {
    inForce[i].forEach((d, j) => {
      const total = taken.get(d.id) ?? 0;
      if (d.maxDiscountAmount && total > d.maxDiscountAmount) {
        reductions[i][j] = Math.floor((reductions[i][j] * d.maxDiscountAmount) / total);
      }
    });
  });

  const unitPrices = lines.map((line, i) => {
    const off = reductions[i].reduce((sum, r) => sum + r, 0);
    return off > 0 ? Math.max(Math.min(1, line.unitPrice), Math.round(line.unitPrice - off)) : line.unitPrice;
  });
  return { unitPrices, applied: inForce.map((deals, i) => deals.filter((_, j) => reductions[i][j] > 0)) };
}
