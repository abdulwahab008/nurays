const findUnique = jest.fn();
const findMany = jest.fn();
const count = jest.fn();
const groupBy = jest.fn();
const cartItems = jest.fn();
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    promotion: { findUnique: (...a: unknown[]) => findUnique(...a), findMany: (...a: unknown[]) => findMany(...a) },
    promotionUsage: { count: (...a: unknown[]) => count(...a), groupBy: (...a: unknown[]) => groupBy(...a) },
    cartItem: { findMany: (...a: unknown[]) => cartItems(...a) },
  },
}));

import promotionService, { promotionAlreadyApplied } from '../src/services/promotion.service';
import { codeDiscount } from '../src/utils/orderPricing';

// The preview of a code (what checkout shows) and the order (what is charged) take the discount from one function, so they
// cannot differ by a rupee any more.
const promotion = (overrides: Record<string, unknown> = {}) => ({
  id: 'promo-1',
  code: 'SAVE',
  sellerId: null,
  isActive: true,
  discountType: 'percentage',
  discountValue: 54,
  maxDiscountAmount: null,
  minOrderAmount: 0,
  applicableProductIds: [],
  usageLimitTotal: null,
  usedCount: 0,
  usageLimitPerUser: 1,
  validFrom: new Date(Date.now() - 86_400_000),
  validUntil: new Date(Date.now() + 86_400_000),
  ...overrides,
});

describe('the preview of a promotion code', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
    groupBy.mockReset().mockResolvedValue([]);
    cartItems.mockReset().mockResolvedValue([]);
  });

  it('takes 54% off Rs 3,500 as exactly Rs 1,890', async () => {
    findUnique.mockResolvedValue(promotion());
    const preview = await promotionService.validatePromotionCode('u1', 'save', 3500);
    expect(preview.discountAmount).toBe(1890);
    expect(preview.finalAmount).toBe(1610);
  });

  it('is the discount the order takes, for percentages, caps and fixed amounts', async () => {
    const cases: Array<[Record<string, unknown>, number]> = [
      [{}, 3500],
      [{ discountValue: 55 }, 200],
      [{ discountValue: 50, maxDiscountAmount: 300 }, 2000],
      [{ discountType: 'fixed', discountValue: 500 }, 300],
      [{ discountType: 'fixed', discountValue: 200 }, 1000],
    ];
    for (const [overrides, cartTotal] of cases) {
      const row = promotion(overrides);
      findUnique.mockResolvedValue(row);
      const preview = await promotionService.validatePromotionCode('u1', 'save', cartTotal);
      expect(preview.discountAmount).toBe(codeDiscount(row, cartTotal));
    }
  });

  // A kitchen's promotion comes off its dishes by itself as a menu deal. The order refuses the same promotion's code
  // (PROMO_ALREADY_APPLIED), so the preview used to promise a second discount the order then turned down.
  describe("a kitchen's own promotion", () => {
    const deal = () => promotion({ id: 'deal-1', code: 'BIRYANI10', sellerId: 'kitchen-1', applicableTo: 'all', discountValue: 10 });
    const dish = (overrides: Record<string, unknown> = {}) => ({ productId: 'p1', sellerId: 'kitchen-1', priceSnapshot: 650, quantity: 2, ...overrides });

    it('is refused when it is already taking its discount off the dishes as a menu deal', async () => {
      findUnique.mockResolvedValue(deal());
      findMany.mockResolvedValue([deal()]);
      cartItems.mockResolvedValue([dish()]);
      await expect(promotionService.validatePromotionCode('u1', 'biryani10', 1300)).rejects.toMatchObject({
        statusCode: 400,
        code: 'PROMO_ALREADY_APPLIED',
      });
    });

    it('uses the one error the order uses, so the customer reads the same sentence in both places', () => {
      expect(promotionAlreadyApplied()).toMatchObject({
        statusCode: 400,
        code: 'PROMO_ALREADY_APPLIED',
        message: 'This promotion is already applied to your order automatically',
      });
    });

    it('still previews when the deal is not taking anything off (the customer has used it up)', async () => {
      const row = promotion({ id: 'deal-1', code: 'BIRYANI10', sellerId: 'kitchen-1', applicableTo: 'all', discountValue: 10, usageLimitPerUser: 2 });
      findUnique.mockResolvedValue(row);
      findMany.mockResolvedValue([row]);
      groupBy.mockResolvedValue([{ promotionId: 'deal-1', _count: { _all: 2 } }]);
      count.mockResolvedValue(1);
      cartItems.mockResolvedValue([dish()]);
      const preview = await promotionService.validatePromotionCode('u1', 'biryani10', 1300);
      expect(preview.discountAmount).toBe(130);
    });

    it('is not asked about menu deals for a platform code, which no kitchen runs', async () => {
      findUnique.mockResolvedValue(promotion({ code: 'WELCOME', discountValue: 15 }));
      cartItems.mockResolvedValue([dish()]);
      const preview = await promotionService.validatePromotionCode('u1', 'welcome', 1300);
      expect(preview.discountAmount).toBe(195);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('keeps saying the code does not apply when none of the dishes belong to the kitchen', async () => {
      findUnique.mockResolvedValue(deal());
      cartItems.mockResolvedValue([dish({ sellerId: 'kitchen-2' })]);
      await expect(promotionService.validatePromotionCode('u1', 'biryani10', 1300)).rejects.toMatchObject({ code: 'PROMO_NOT_APPLICABLE' });
    });
  });
});
