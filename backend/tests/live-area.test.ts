/**
 * Nuray is live in a few Lahore areas only. Kitchens whose area is switched off (the Karachi demo kitchens) are not shown to
 * buyers and cannot be ordered from; a kitchen with no area is not gated (there is no area to judge it by). The database is a hand-written double; what is under test is
 * what each read asks for and what the tray refuses.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/delivery-pricing.service', () => ({ getPlatformDeliveryPricing: jest.fn() }));
jest.mock('../src/services/promotion.service', () => ({ __esModule: true, default: {} }));

import { listPublicSellers, getPublicSeller } from '../src/services/public-seller.service';
import productService from '../src/services/product.service';
import cartService from '../src/services/cart.service';
import { assertInLiveArea } from '../src/utils/liveArea';

const live = { NOT: { community: { is: { isActive: false } } } };

describe('kitchen lists', () => {
  beforeEach(() => {
    db.seller = { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) };
  });

  it('ask only for kitchens in a live area, with or without a city', async () => {
    await listPublicSellers({});
    expect(db.seller.findMany.mock.calls[0][0].where).toMatchObject(live);
    await listPublicSellers({ city: 'Karachi' });
    expect(db.seller.findMany.mock.calls[1][0].where).toMatchObject(live);
  });

  it("a kitchen's own page is a 404 outside the live areas", async () => {
    await expect(getPublicSeller('s1')).rejects.toMatchObject({ statusCode: 404 });
    expect(db.seller.findFirst.mock.calls[0][0].where).toMatchObject(live);
  });
});

describe('the dish list', () => {
  it('asks only for dishes from kitchens in a live area', async () => {
    db.product = { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) };
    await productService.getProducts({});
    expect(db.product.count.mock.calls[0][0].where.seller).toMatchObject({ status: 'active', ...live });
  });
});

describe('a dish page', () => {
  it('is a 404 for a buyer when the kitchen is outside the live areas', async () => {
    db.community = { findFirst: jest.fn() };
    db.product = {
      findFirst: jest.fn(async () => ({
        id: 'p1', approvalStatus: 'approved', seller: { userId: 'owner', status: 'active', community: { isActive: false } },
      })),
    };
    await expect(productService.getProductByIdentifier('p1', 'buyer')).rejects.toMatchObject({ statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('putting a dish in the tray', () => {
  const dish = (community: { isActive: boolean } | null) => ({
    id: 'p1', sellerId: 's1', isActive: true, approvalStatus: 'approved', name: 'Biryani', menuType: 'fixed', availableDays: [], menuDate: null,
    seller: { id: 's1', businessName: 'Gulshan Kitchen', status: 'active', community },
  });

  it('is refused when the kitchen area is switched off', async () => {
    db.cart = { findUnique: jest.fn(async () => ({ id: 'c1', userId: 'u1' })) };
    db.product = { findFirst: jest.fn(async () => dish({ isActive: false })) };
    await expect(cartService.addToCart('u1', { productId: 'p1', quantity: 1 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'SELLER_OUTSIDE_SERVICE_AREA',
      message: "Gulshan Kitchen is not taking orders: Nuray isn't in its area yet",
    });
  });
});

describe('the checkout check', () => {
  it('lets a kitchen in a live area, or with no area, through', () => {
    expect(() => assertInLiveArea({ businessName: 'K', community: { isActive: true } })).not.toThrow();
    expect(() => assertInLiveArea({ businessName: 'K', community: null })).not.toThrow();
    expect(() => assertInLiveArea({ businessName: 'K', community: { isActive: false } })).toThrow("K is not taking orders: Nuray isn't in its area yet");
  });
});
