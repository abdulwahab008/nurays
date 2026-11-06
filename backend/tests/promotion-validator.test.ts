import { createPromotionSchema, updatePromotionSchema } from '../src/validators/promotion.validator';

const base = { name: 'Eid', code: 'EID', validFrom: '2026-11-01', validUntil: '2026-11-30' };

describe('promo code limits', () => {
  it('refuses a fixed discount that would make any order free', () => {
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'fixed', discountValue: 99_999 }).success).toBe(false);
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'fixed', discountValue: 800, minOrderAmount: 500 }).success).toBe(false);
  });

  it('accepts ordinary fixed and percentage discounts', () => {
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'fixed', discountValue: 150 }).success).toBe(true);
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'fixed', discountValue: 5000 }).success).toBe(true);
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'fixed', discountValue: 300, minOrderAmount: 1500 }).success).toBe(true);
    expect(createPromotionSchema.safeParse({ ...base, discountType: 'percentage', discountValue: 60 }).success).toBe(true);
  });

  it('checks an update that names the discount and the minimum', () => {
    expect(updatePromotionSchema.safeParse({ discountType: 'fixed', discountValue: 2000, minOrderAmount: 1000 }).success).toBe(false);
    expect(updatePromotionSchema.safeParse({ discountValue: 2000 }).success).toBe(true);
  });
});
