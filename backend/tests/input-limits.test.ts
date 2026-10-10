/**
 * Input that is the right type but beyond what the database can hold, or not a real date, is refused
 * by the validators with a 400. Left alone it reaches Prisma and comes back as a 500, which pages
 * whoever watches the error tracker for something a visitor typed.
 */
import { MAX_PAGE, pageArgs } from '../src/utils/pagination';
import { getProductsQuerySchema, createProductSchema, updateProductSchema } from '../src/validators/product.validator';
import { updateSellerSchema } from '../src/validators/seller.validator';
import { getSellerOrdersQuerySchema } from '../src/validators/seller-order.validator';
import { createPromotionSchema } from '../src/validators/promotion.validator';
import { addToCartSchema } from '../src/validators/cart.validator';
import { calendarDay, readableDate } from '../src/validators/primitives';

describe('pageArgs', () => {
  it('turns a page nobody could reach into the deepest one served', () => {
    for (const huge of ['99999999999999999999', 1e20, Infinity, '1e999', 'Infinity']) {
      const { page, skip } = pageArgs(huge, 100);
      expect(page).toBe(MAX_PAGE);
      expect(skip).toBe((MAX_PAGE - 1) * 100);
      expect(skip).toBeLessThan(2 ** 31); // fits the database's integer
    }
  });

  it('still reads ordinary and nonsense input as before', () => {
    expect(pageArgs('3', '10')).toEqual({ page: 3, limit: 10, skip: 20 });
    expect(pageArgs(undefined, undefined)).toEqual({ page: 1, limit: 20, skip: 0 });
    for (const bad of [-5, 0, 'abc', NaN, ['1', '2'], null, {}]) expect(pageArgs(bad, bad).page).toBe(1);
    expect(pageArgs(1, 100000).limit).toBe(100);
  });
});

describe('dates', () => {
  it('accepts a day that exists and refuses one that does not', () => {
    for (const ok of ['2026-10-31', '2024-02-29', '2000-01-01', '2100-12-31']) expect(calendarDay.safeParse(ok).success).toBe(true);
    for (const bad of ['2026-13-45', '2026-02-30', '2026-10-32', '1999-12-31', '2101-01-01', 'today', '2026-1-5', '']) expect(calendarDay.safeParse(bad).success).toBe(false);
  });

  it('accepts a date the server can read and refuses text', () => {
    const date = readableDate('dateFrom');
    for (const ok of ['2026-10-31', '2026-10-31T10:00:00Z', '2026-10-31T10:00:00.000+05:00']) expect(date.safeParse(ok).success).toBe(true);
    for (const bad of ['abc', 'null', '2026-13-45', '', 'x'.repeat(100)]) expect(date.safeParse(bad).success).toBe(false);
  });

  it('a kitchen\'s order list takes real dates only', () => {
    expect(getSellerOrdersQuerySchema.safeParse({ dateFrom: '2026-10-01', dateTo: '2026-10-31T23:59:59Z' }).success).toBe(true);
    for (const query of [{ dateFrom: 'abc' }, { dateTo: 'abc' }, { dateFrom: '2026-13-45' }, { dateFrom: 'null' }]) {
      expect(getSellerOrdersQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('the public product filter', () => {
  const parsed = (query: Record<string, string>) => getProductsQuerySchema.parse(query);

  it('reads finite numbers and leaves out anything else instead of passing Infinity to the database', () => {
    expect(parsed({ minPrice: '12.5', maxPrice: '300' })).toMatchObject({ minPrice: 12.5, maxPrice: 300 });
    for (const bad of ['1e999', '-1e999', 'Infinity', 'abc', 'NaN']) {
      expect(parsed({ minPrice: bad, maxPrice: bad, customerLat: bad, customerLng: bad, maxDistanceKm: bad })).toMatchObject({
        minPrice: undefined, maxPrice: undefined, customerLat: undefined, customerLng: undefined, maxDistanceKm: undefined,
      });
    }
  });
});

describe('a dish', () => {
  const dish = { name: 'Biryani', price: 300, unit: 'plate', stockQuantity: 10, stockType: 'direct' as const };

  it('takes sensible values', () => {
    expect(createProductSchema.safeParse({ ...dish, originalPrice: 350, costPrice: 120, shelfLifeHours: 48, preparationTime: 30, weightGrams: 500, storageDays: 3, minOrderQuantity: 1, maxOrderQuantity: 20 }).success).toBe(true);
    expect(updateProductSchema.safeParse({ menuType: 'daily', menuDate: '2026-10-31' }).success).toBe(true);
    expect(updateProductSchema.safeParse({ menuType: 'daily', menuDate: 'today' }).success).toBe(true);
    expect(updateProductSchema.safeParse({ menuType: 'fixed', menuDate: null }).success).toBe(true);
  });

  it.each([
    { price: 1e12 }, { price: 1_000_001 }, { originalPrice: 1e12 }, { costPrice: 1e12 }, { stockQuantity: 3_000_000_000 }, { shelfLifeHours: 3_000_000_000 },
    { preparationTime: 3_000_000_000 }, { weightGrams: 3_000_000_000 }, { storageDays: 3_000_000_000 }, { minOrderQuantity: 3_000_000_000 }, { maxOrderQuantity: 3_000_000_000 },
    { menuType: 'daily', menuDate: '2026-13-45' }, { menuDate: '2026-02-30' },
  ])('refuses %j', (bad) => {
    expect(updateProductSchema.safeParse(bad).success).toBe(false);
    expect(createProductSchema.safeParse({ ...dish, ...bad }).success).toBe(false);
  });
});

describe('a kitchen\'s settings', () => {
  it('take sensible values', () => {
    expect(
      updateSellerSchema.safeParse({
        deliveryFeeFixed: 250, deliveryFeeBase: 100, deliveryFeePerKm: 35.5, minOrderAmountForDelivery: 800, freeDeliveryThreshold: 2500, maxDailyOrders: 60,
        minPrepTimeMinutes: 45, advanceBookingMinDays: 1, advanceBookingMaxDays: 14, lowStockThreshold: 5, freeDeliveryRadiusKm: 4, maxDeliveryDistanceKm: 20,
        availabilityOverride: 'vacation', availabilityOverrideUntil: '2026-11-05T09:00:00Z',
        distancePricingTiers: [{ maxKm: 3, fee: 80 }, { maxKm: 8, fee: 150 }],
      }).success
    ).toBe(true);
  });

  it.each([
    { deliveryFeePerKm: 99_999_999 }, { minOrderAmountForDelivery: 1e12 }, { freeDeliveryThreshold: 1e12 }, { maxDailyOrders: 3_000_000_000 }, { minPrepTimeMinutes: 3_000_000_000 },
    { advanceBookingMinDays: 3_000_000_000 }, { advanceBookingMaxDays: 3_000_000_000 }, { lowStockThreshold: 3_000_000_000 }, { deliveryFeeFixed: 3_000_000_000 }, { deliveryFeeBase: 3_000_000_000 },
    { freeDeliveryRadiusKm: 1e300 }, { maxDeliveryDistanceKm: 1e300 }, { availabilityOverrideUntil: 'not a date' }, { distancePricingTiers: [{ maxKm: 1e12, fee: 10 }] },
  ])('refuses %j', (bad) => {
    expect(updateSellerSchema.safeParse(bad).success).toBe(false);
  });
});

describe('the rest of the numbers', () => {
  it('a promotion and a cart line stay within what the database holds', () => {
    const promo = { name: 'Eid', code: 'EID', discountType: 'fixed' as const, discountValue: 100, validFrom: '2026-10-01', validUntil: '2026-10-31' };
    expect(createPromotionSchema.safeParse(promo).success).toBe(true);
    for (const bad of [{ discountValue: 1e12 }, { minOrderAmount: 1e12 }, { maxDiscountAmount: 1e12 }, { usageLimitTotal: 3_000_000_000 }, { usageLimitPerUser: 3_000_000_000 }]) {
      expect(createPromotionSchema.safeParse({ ...promo, ...bad }).success).toBe(false);
    }
    expect(addToCartSchema.safeParse({ productId: '3f2b8a54-6a4a-4d33-9d0f-7a3f4a1c2b11', quantity: 2 }).success).toBe(true);
    expect(addToCartSchema.safeParse({ productId: '3f2b8a54-6a4a-4d33-9d0f-7a3f4a1c2b11', quantity: 3_000_000_000 }).success).toBe(false);
  });
});
