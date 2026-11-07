jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    product: { findMany: jest.fn() },
    promotion: { findMany: jest.fn() },
    promotionUsage: { groupBy: jest.fn() },
  },
}));

import prisma from '../src/config/database';
import promotionService from '../src/services/promotion.service';
import { quotedTotalProblem } from '../src/services/order-placement.service';
import { applyStackedDiscount } from '../src/utils/pricing';

const db = prisma as unknown as {
  product: { findMany: jest.Mock };
  promotion: { findMany: jest.Mock };
  promotionUsage: { groupBy: jest.Mock };
};

const weekendDeal = {
  id: 'deal-1',
  name: 'Audit weekend deal',
  sellerId: 'seller-1',
  discountType: 'percentage',
  discountValue: 20,
  applicableTo: 'products',
  applicableProductIds: ['samosa'],
  usageLimitTotal: null,
  usedCount: 3,
  usageLimitPerUser: 1,
};

/** The unit price the storefront, tray and checkout show: the catalog's deals stacked on the dish price. */
async function shownUnitPrice(userId: string | undefined, price: number) {
  const catalog = await promotionService.getPromotionsForCatalog(['samosa'], userId);
  return applyStackedDiscount(
    price,
    (catalog.samosa ?? []).map((p) => ({ discountType: p.type, discountValue: p.discountValue }))
  );
}

async function chargedUnitPrice(userId: string, price: number) {
  const { discountedUnitPrices } = await promotionService.computeOrderCatalogDiscounts(userId, [
    { productId: 'samosa', sellerId: 'seller-1', unitPrice: price, quantity: 1 },
  ]);
  return discountedUnitPrices[0];
}

describe('the deal price shown is the price charged', () => {
  beforeEach(() => {
    db.product.findMany.mockResolvedValue([{ id: 'samosa', sellerId: 'seller-1' }]);
    db.promotion.findMany.mockResolvedValue([weekendDeal]);
    db.promotionUsage.groupBy.mockReset();
  });

  it('shows and charges the deal price to a customer who has not used the deal', async () => {
    db.promotionUsage.groupBy.mockResolvedValue([]);
    expect(await shownUnitPrice('customer-1', 1440)).toBe(1152);
    expect(await chargedUnitPrice('customer-1', 1440)).toBe(1152);
  });

  it('shows and charges the full price once the customer has used a once-per-customer deal', async () => {
    db.promotionUsage.groupBy.mockResolvedValue([{ promotionId: 'deal-1', _count: { _all: 1 } }]);
    expect(await shownUnitPrice('customer-1', 1440)).toBe(1440);
    expect(await chargedUnitPrice('customer-1', 1440)).toBe(1440);
  });

  it("counts only the signed-in customer's own use of the deal", async () => {
    db.promotionUsage.groupBy.mockResolvedValue([]);
    await promotionService.getPromotionsForCatalog(['samosa'], 'customer-1');
    expect(db.promotionUsage.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'customer-1' }) })
    );
  });

  it('still shows the deal to a visitor who is not signed in', async () => {
    expect(await shownUnitPrice(undefined, 1440)).toBe(1152);
    expect(db.promotionUsage.groupBy).not.toHaveBeenCalled();
  });

  it('hides a deal whose total uses have run out', async () => {
    db.promotion.findMany.mockResolvedValue([{ ...weekendDeal, usageLimitTotal: 3 }]);
    expect(await shownUnitPrice(undefined, 1440)).toBe(1440);
  });
});

describe('quotedTotalProblem', () => {
  it('places the order when the total is the one the checkout showed', () => {
    expect(quotedTotalProblem(1210, 1210)).toBeNull();
    expect(quotedTotalProblem(undefined, 1512)).toBeNull();
  });

  it('refuses the order with the new total when the price moved after the checkout showed it', () => {
    const problem = quotedTotalProblem(1210, 1512);
    expect(problem).not.toBeNull();
    expect(problem?.statusCode).toBe(409);
    expect(problem?.code).toBe('PRICE_CHANGED');
    expect(problem?.message).toContain('1,512');
    expect(problem?.details).toEqual({ total: 1512, expectedTotal: 1210 });
  });
});
