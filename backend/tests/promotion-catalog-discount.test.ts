jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    promotion: { findMany: jest.fn(), update: jest.fn() },
    promotionUsage: { groupBy: jest.fn(), count: jest.fn() },
  },
}));

import { applyStackedDiscount } from '../src/services/promotion.service';
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

describe('applyStackedDiscount', () => {
  it('applies a single percentage discount', () => {
    expect(applyStackedDiscount(1000, [{ discountType: 'percentage', discountValue: 10 }])).toBe(900);
  });

  it('applies a single fixed discount', () => {
    expect(applyStackedDiscount(1000, [{ discountType: 'fixed', discountValue: 150 }])).toBe(850);
  });

  it('stacks percentage before fixed, matching the frontend order', () => {
    // 1000 -> 10% off -> 900 -> -100 fixed -> 800
    expect(applyStackedDiscount(1000, [
      { discountType: 'fixed', discountValue: 100 },
      { discountType: 'percentage', discountValue: 10 },
    ])).toBe(800);
  });

  it('never discounts below zero', () => {
    expect(applyStackedDiscount(50, [{ discountType: 'fixed', discountValue: 200 }])).toBe(0);
  });

  it('returns the base price unchanged when there are no promos', () => {
    expect(applyStackedDiscount(1234, [])).toBe(1234);
  });
});

describe('computeOrderCatalogDiscounts', () => {
  beforeEach(() => {
    findMany.mockReset();
    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
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
