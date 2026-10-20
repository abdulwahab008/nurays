/**
 * The delivery time on a dish page: a time is given for a trip the kitchen makes, and none for a trip it will not make. A buyer
 * in Karachi looking at a Lahore kitchen's dish was told "3,094 min" (a day and a half) next to "Nuray riders deliver up to 20 km".
 * The kitchen, the availability check and the platform prices are doubles; the rule under test is in computeCustomerFacingSellerInfo.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/availability.service', () => ({
  isAcceptingOrders: jest.fn(async () => ({ accepting: true, reason: null })),
  computeSellerAvailability: jest.fn(),
}));
jest.mock('../src/services/delivery-pricing.service', () => ({
  getPlatformDeliveryPricing: jest.fn(async () => ({ perKm: 20, includedKm: 3, maxKm: 20, fallbackBaseFee: 150, communities: new Map() })),
}));
jest.mock('../src/services/ranking.service', () => ({ searchRankedProductIds: jest.fn() }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notifySeller: jest.fn(), notify: jest.fn() }));
jest.mock('../src/storage', () => ({ isStoredFile: jest.fn(), presentFile: jest.fn() }));

import { computeCustomerFacingSellerInfo } from '../src/services/product.service';

const LAHORE_KITCHEN = {
  id: 's1',
  latitude: 31.4728,
  longitude: 74.4538,
  minPrepTimeMinutes: 30,
  deliveryProvider: 'platform',
  freeDeliveryAreas: null,
  // What the availability check reads (it is a double here).
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

describe('delivery time shown to a buyer', () => {
  it('is a range for an address the kitchen delivers to', async () => {
    // about 1.5 km away
    const info = await computeCustomerFacingSellerInfo(LAHORE_KITCHEN, 31.4828, 74.4638);
    expect(info.delivery?.deliverable).toBe(true);
    expect(info.delivery?.estimatedMinMinutes).toBeGreaterThanOrEqual(40);
    expect(info.delivery?.estimatedMaxMinutes).toBeGreaterThan(info.delivery?.estimatedMinMinutes as number);
    expect(info.delivery?.estimatedMaxMinutes).toBeLessThan(120);
  });

  it('is none for an address the kitchen does not deliver to, such as another city', async () => {
    // Karachi, about 1,000 km from this kitchen
    const info = await computeCustomerFacingSellerInfo(LAHORE_KITCHEN, 24.918, 67.0971);
    expect(info.delivery?.deliverable).toBe(false);
    expect(info.delivery?.reason).toMatch(/up to 20 km/);
    expect(info.delivery?.estimatedMinMinutes).toBeNull();
    expect(info.delivery?.estimatedMaxMinutes).toBeNull();
    expect(info.delivery?.distanceKm).toBeGreaterThan(900);
  });

  it('is not worked out at all when the buyer has no address', async () => {
    const info = await computeCustomerFacingSellerInfo(LAHORE_KITCHEN, null, null);
    expect(info.delivery).toBeNull();
  });
});
