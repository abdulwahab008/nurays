const findUnique = jest.fn();
const count = jest.fn();
const cartItems = jest.fn();
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    promotion: { findUnique: (...a: unknown[]) => findUnique(...a) },
    promotionUsage: { count: (...a: unknown[]) => count(...a) },
    cartItem: { findMany: (...a: unknown[]) => cartItems(...a) },
  },
}));

import promotionService from '../src/services/promotion.service';
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
    count.mockReset().mockResolvedValue(0);
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
});
