/**
 * The delivery fee a buyer is shown while browsing is the fee the order charges them. Kitchen cards, the storefront and
 * the tray said "Rs 50 delivery" for a Nuray-rider kitchen while checkout and the placed order charged Rs 0: the order
 * puts a Nuray rider's fee on the kitchen (splitDeliveryFees), the browse quote passed it on to the buyer. The "Free
 * delivery" filter left these kitchens out for the same reason.
 */
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    community: { findFirst: jest.fn() },
    seller: { findMany: jest.fn() },
    product: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  },
}));
jest.mock('../src/services/availability.service', () => ({
  isAcceptingOrders: jest.fn(async () => ({ accepting: true, reason: null })),
  computeSellerAvailability: jest.fn(() => ({ isOpen: true })),
}));
jest.mock('../src/services/delivery-pricing.service', () => ({
  getPlatformDeliveryPricing: jest.fn(async () => ({
    perKm: 20,
    includedKm: 3,
    maxKm: 20,
    fallbackBaseFee: 150,
    communities: new Map([['gulshan', { centerLat: 24.92, centerLng: 67.09, sameCommunityFee: 50, crossCommunityBaseFee: 150 }]]),
  })),
}));
jest.mock('../src/services/ranking.service', () => ({ searchRankedProductIds: jest.fn() }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notifySeller: jest.fn(), notify: jest.fn() }));
jest.mock('../src/storage', () => ({ isStoredFile: jest.fn(), presentFile: jest.fn() }));

import prisma from '../src/config/database';
import { ProductService, computeCustomerFacingSellerInfo } from '../src/services/product.service';
import { getDeliveryFeeForSeller } from '../src/utils/deliveryFee';
import { splitDeliveryFees } from '../src/utils/orderPricing';

const db = prisma as unknown as {
  community: { findFirst: jest.Mock };
  seller: { findMany: jest.Mock };
  product: { count: jest.Mock; findMany: jest.Mock };
};

const KITCHEN = {
  id: 'nuray-rider-kitchen',
  latitude: null,
  longitude: null,
  minPrepTimeMinutes: 20,
  communityId: 'gulshan',
  deliveryProvider: 'platform',
  freeDeliveryAreas: ['Gulshan-e-Iqbal'],
  status: 'active',
  scheduleMode: 'always',
  operatingHours: null,
  availabilityOverride: null,
  availabilityOverrideUntil: null,
  availabilityNote: null,
  orderCutoffTime: null,
  maxDailyOrders: null,
  preOrderOnly: false,
};
const OWN_DELIVERY_KITCHEN = { ...KITCHEN, id: 'own-delivery-kitchen', deliveryProvider: 'self', freeDeliveryAreas: null, deliveryFeeType: 'fixed', deliveryFeeFixed: 120 };

async function chargedAtCheckout(seller: typeof KITCHEN | typeof OWN_DELIVERY_KITCHEN) {
  const pricing = await jest.requireMock('../src/services/delivery-pricing.service').getPlatformDeliveryPricing();
  const result = getDeliveryFeeForSeller(seller, { communityId: 'gulshan' }, null, null, 1000, { pricing });
  return splitDeliveryFees([{ sellerId: seller.id, fee: result.fee, pricedByPlatform: result.pricing != null }]).deliveryFee;
}

describe('delivery fee quoted to a buyer while browsing', () => {
  it('is nothing for a Nuray-rider kitchen, as the order charges (the kitchen pays the rider fee)', async () => {
    const info = await computeCustomerFacingSellerInfo(KITCHEN, null, null, 'gulshan');
    expect(info.delivery).toMatchObject({ deliverable: true, fee: 0 });
    expect(info.delivery?.fee).toBe(await chargedAtCheckout(KITCHEN));
  });

  it("is the kitchen's own fee when it delivers itself, as the order charges", async () => {
    const info = await computeCustomerFacingSellerInfo(OWN_DELIVERY_KITCHEN, null, null, 'gulshan');
    expect(info.delivery).toMatchObject({ deliverable: true, fee: 120 });
    expect(info.delivery?.fee).toBe(await chargedAtCheckout(OWN_DELIVERY_KITCHEN));
  });
});

describe('"Free delivery" dish filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps the kitchens that charge the buyer's area nothing, Nuray-rider kitchens included", async () => {
    db.community.findFirst.mockResolvedValue({ id: 'gulshan', neighborCommunityIds: [] });
    db.seller.findMany.mockResolvedValue([KITCHEN, OWN_DELIVERY_KITCHEN]);
    await new ProductService().getProducts({ freeDelivery: true, communityId: 'gulshan' });
    const where = db.product.count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"sellerId":{"in":["nuray-rider-kitchen"]}');
  });

  it('without an area, does not leave out Nuray-rider kitchens', async () => {
    await new ProductService().getProducts({ freeDelivery: true });
    const where = db.product.count.mock.calls[0][0].where;
    expect(where.seller.OR).toEqual(expect.arrayContaining([{ deliveryProvider: { not: 'self' } }]));
    expect(where.seller.freeDeliveryRadiusKm).toBeUndefined();
  });
});
