jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    promotion: { findMany: jest.fn(), update: jest.fn() },
    promotionUsage: { groupBy: jest.fn(), count: jest.fn() },
  },
}));

import { priceDealLines } from '../src/utils/pricing';
import promotionService from '../src/services/promotion.service';
import prisma from '../src/config/database';

const findMany = (prisma as any).promotion.findMany as jest.Mock;
const groupBy = (prisma as any).promotionUsage.groupBy as jest.Mock;

function makePromotion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'promo-1',
    sellerId: 'seller-1',
    discountType: 'percentage',
    discountValue: 10,
    applicableTo: 'all',
    applicableProductIds: [],
    usageLimitTotal: null,
    usedCount: 0,
    usageLimitPerUser: 1,
    ...overrides,
  };
}

/** One unit of a dish ordered by itself, after its deals. */
function oneUnitPrice(price: number, promos: Array<{ discountType: string; discountValue: number }>): number {
  const deals = promos.map((p, i) => ({ id: String(i), minOrderAmount: 0, maxDiscountAmount: null, ...p }));
  return priceDealLines([{ sellerId: '', unitPrice: price, quantity: 1, deals }]).unitPrices[0];
}

describe('one unit of a dish after its deals', () => {
  it('applies a single percentage discount', () => {
    expect(oneUnitPrice(1000, [{ discountType: 'percentage', discountValue: 10 }])).toBe(900);
  });

  it('applies a single fixed discount', () => {
    expect(oneUnitPrice(1000, [{ discountType: 'fixed', discountValue: 150 }])).toBe(850);
  });

  it('stacks percentage before fixed, matching the frontend order', () => {
    // 1000 -> 10% off -> 900 -> -100 fixed -> 800
    expect(oneUnitPrice(1000, [
      { discountType: 'fixed', discountValue: 100 },
      { discountType: 'percentage', discountValue: 10 },
    ])).toBe(800);
  });

  it('never discounts a dish below Rs 1', () => {
    expect(oneUnitPrice(50, [{ discountType: 'fixed', discountValue: 200 }])).toBe(1);
    expect(oneUnitPrice(180, [{ discountType: 'percentage', discountValue: 100 }])).toBe(1);
  });

  it('returns the base price unchanged when there are no promos', () => {
    expect(oneUnitPrice(1234, [])).toBe(1234);
  });
});

describe('computeOrderCatalogDiscounts', () => {
  beforeEach(() => {
    findMany.mockReset();
    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
  });

  // The audit's case: Rs 200 off with a Rs 1,500 minimum came off every unit of a Rs 1,250 order.
  const eid200 = (overrides: Partial<Record<string, unknown>> = {}) => makePromotion({ discountType: 'fixed', discountValue: 200, minOrderAmount: 1500, ...overrides });

  it("leaves the menu price when the kitchen's goods are under the deal's minimum order, and records no use", async () => {
    findMany.mockResolvedValue([eid200()]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 250, quantity: 5 }]
    );
    expect(discountedUnitPrices).toEqual([250]);
    expect(usagesToRecord).toEqual([]);
  });

  it("applies the deal once the kitchen's goods reach the minimum, counting every dish of that kitchen and no other kitchen's", async () => {
    findMany.mockResolvedValue([eid200({})]);
    const reached = await promotionService.computeOrderCatalogDiscounts('customer-1', [
      { productId: 'p1', sellerId: 'seller-1', unitPrice: 250, quantity: 2 },
      { productId: 'p2', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 },
    ]);
    expect(reached.discountedUnitPrices).toEqual([50, 800]);

    const otherKitchen = await promotionService.computeOrderCatalogDiscounts('customer-1', [
      { productId: 'p1', sellerId: 'seller-1', unitPrice: 250, quantity: 2 },
      { productId: 'p9', sellerId: 'seller-2', unitPrice: 1000, quantity: 1 },
    ]);
    expect(otherKitchen.discountedUnitPrices).toEqual([250, 1000]);
    expect(otherKitchen.usagesToRecord).toEqual([]);
  });

  it('never prices a dish cheaper than the discount at Rs 0', async () => {
    findMany.mockResolvedValue([makePromotion({ discountType: 'fixed', discountValue: 200 })]);
    const { discountedUnitPrices } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 180, quantity: 50 }]
    );
    expect(discountedUnitPrices).toEqual([1]);
  });

  it("takes no more than the deal's maximum discount off the whole order", async () => {
    findMany.mockResolvedValue([makePromotion({ discountType: 'percentage', discountValue: 20, maxDiscountAmount: 300 })]);
    const items = [
      { productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 3 },
      { productId: 'p2', sellerId: 'seller-1', unitPrice: 455, quantity: 2 },
    ];
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts('customer-1', items);
    const off = items.reduce((sum, item, i) => sum + (item.unitPrice - discountedUnitPrices[i]) * item.quantity, 0);
    expect(off).toBeLessThanOrEqual(300);
    expect(off).toBeGreaterThan(290);
    expect(usagesToRecord).toEqual([{ promotionId: 'promo-1', discountApplied: off }]);

    // Under the cap nothing is scaled: 20% of 1,000.
    const small = await promotionService.computeOrderCatalogDiscounts('customer-1', [items[0]].map((i) => ({ ...i, quantity: 1 })));
    expect(small.discountedUnitPrices).toEqual([800]);
  });

  it('discounts an item covered by an active seller-wide catalog promotion', async () => {
    findMany.mockResolvedValue([makePromotion()]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 2 }]
    );
    expect(discountedUnitPrices).toEqual([900]);
    expect(usagesToRecord).toEqual([{ promotionId: 'promo-1', discountApplied: 200 }]); // (1000-900) * 2
  });

  it('leaves price untouched when no promotion covers the product', async () => {
    findMany.mockResolvedValue([]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    expect(discountedUnitPrices).toEqual([1000]);
    expect(usagesToRecord).toEqual([]);
  });

  it('does not apply a promotion once its total usage cap is reached', async () => {
    findMany.mockResolvedValue([makePromotion({ usageLimitTotal: 5, usedCount: 5 })]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    expect(discountedUnitPrices).toEqual([1000]);
    expect(usagesToRecord).toEqual([]);
  });

  it('does not apply a promotion once this customer has hit their per-user cap', async () => {
    findMany.mockResolvedValue([makePromotion({ usageLimitPerUser: 1 })]);
    groupBy.mockResolvedValue([{ promotionId: 'promo-1', _count: { _all: 1 } }]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    expect(discountedUnitPrices).toEqual([1000]);
    expect(usagesToRecord).toEqual([]);
  });

  it('does not discount a product outside the promotion scope (selected-products list)', async () => {
    findMany.mockResolvedValue([makePromotion({ applicableTo: 'selected', applicableProductIds: ['other-product'] })]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    expect(discountedUnitPrices).toEqual([1000]);
    expect(usagesToRecord).toEqual([]);
  });

  it('ignores a promotion from a different seller', async () => {
    findMany.mockResolvedValue([makePromotion({ sellerId: 'seller-2' })]);
    const { discountedUnitPrices } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    expect(discountedUnitPrices).toEqual([1000]);
  });

  it('stacks two simultaneous seller-wide promotions on the same item', async () => {
    findMany.mockResolvedValue([
      makePromotion({ id: 'promo-a', discountType: 'percentage', discountValue: 10 }),
      makePromotion({ id: 'promo-b', discountType: 'fixed', discountValue: 50 }),
    ]);
    const { discountedUnitPrices, usagesToRecord } = await promotionService.computeOrderCatalogDiscounts(
      'customer-1',
      [{ productId: 'p1', sellerId: 'seller-1', unitPrice: 1000, quantity: 1 }]
    );
    // 1000 -> 10% off -> 900 -> -50 fixed -> 850
    expect(discountedUnitPrices).toEqual([850]);
    expect(usagesToRecord).toHaveLength(2);
    expect(usagesToRecord).toEqual(
      expect.arrayContaining([
        { promotionId: 'promo-a', discountApplied: 150 },
        { promotionId: 'promo-b', discountApplied: 150 },
      ])
    );
  });

  it('returns unit prices unchanged and no usages for an empty item list', async () => {
    const result = await promotionService.computeOrderCatalogDiscounts('customer-1', []);
    expect(result).toEqual({ discountedUnitPrices: [], usagesToRecord: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});
