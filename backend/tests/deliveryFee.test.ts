import { getDeliveryFeeForSeller, haversineKm } from '../src/utils/deliveryFee';

// Karachi Saddar (seller) ~24.85,67.02 vs a nearby address ~5km away vs a very far address (Lahore, ~1180km) and Dubai (~1250km, different country).
const SELLER_LAT = 24.85;
const SELLER_LNG = 67.02;
const NEARBY_ADDR = { area: 'Clifton', city: 'Karachi', latitude: 24.82, longitude: 67.03 }; // ~3.4km
const LAHORE_ADDR = { area: 'Gulberg', city: 'Lahore', latitude: 31.52, longitude: 74.35 };
const DUBAI_ADDR = { area: 'Downtown', city: 'Dubai', latitude: 25.2, longitude: 55.27 };

function baseSeller(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    freeDeliveryAreas: [],
    freeDeliveryRadiusKm: null,
    latitude: SELLER_LAT,
    longitude: SELLER_LNG,
    deliveryFeeType: null,
    deliveryFeeFixed: null,
    deliveryFeeBase: null,
    deliveryFeePerKm: null,
    distancePricingTiers: null,
    maxDeliveryDistanceKm: null,
    minOrderAmountForDelivery: null,
    freeDeliveryThreshold: null,
    allowedPostalCodes: [],
    deliveryZones: null,
    ...overrides,
  };
}

describe('getDeliveryFeeForSeller — max delivery distance (previously unbounded)', () => {
  it('refuses delivery beyond the configured max distance', () => {
    const seller = baseSeller({ maxDeliveryDistanceKm: 10, deliveryFeeType: 'distance', deliveryFeeBase: 100, deliveryFeePerKm: 20 });
    const result = getDeliveryFeeForSeller(seller, LAHORE_ADDR);
    expect(result.deliverable).toBe(false);
    expect(result.reason).toMatch(/10km/);
  });

  it('refuses delivery to a different country entirely', () => {
    const seller = baseSeller({ maxDeliveryDistanceKm: 15, deliveryFeeType: 'distance', deliveryFeeBase: 100, deliveryFeePerKm: 20 });
    const result = getDeliveryFeeForSeller(seller, DUBAI_ADDR);
    expect(result.deliverable).toBe(false);
  });

  it('allows delivery within the max distance', () => {
    const seller = baseSeller({ maxDeliveryDistanceKm: 10, deliveryFeeType: 'distance', deliveryFeeBase: 100, deliveryFeePerKm: 20 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.deliverable).toBe(true);
  });

  it('is unbounded when maxDeliveryDistanceKm is not set (documented pre-existing behavior)', () => {
    const seller = baseSeller({ deliveryFeeType: 'distance', deliveryFeeBase: 100, deliveryFeePerKm: 20 });
    const result = getDeliveryFeeForSeller(seller, DUBAI_ADDR);
    expect(result.deliverable).toBe(true);
  });
});

describe('getDeliveryFeeForSeller — postal code restriction', () => {
  it('refuses an address whose postal code is not in the allow-list', () => {
    const seller = baseSeller({ allowedPostalCodes: ['74200', '74400'] });
    const result = getDeliveryFeeForSeller(seller, { ...NEARBY_ADDR, postalCode: '75500' });
    expect(result.deliverable).toBe(false);
  });

  it('allows an address whose postal code is in the allow-list', () => {
    const seller = baseSeller({ allowedPostalCodes: ['74200'] });
    const result = getDeliveryFeeForSeller(seller, { ...NEARBY_ADDR, postalCode: '74200' });
    expect(result.deliverable).toBe(true);
  });

  it('has no postal-code restriction when the list is empty', () => {
    const seller = baseSeller({ allowedPostalCodes: [] });
    const result = getDeliveryFeeForSeller(seller, { ...NEARBY_ADDR, postalCode: 'anything' });
    expect(result.deliverable).toBe(true);
  });
});

describe('getDeliveryFeeForSeller — minimum order amount for delivery', () => {
  it('refuses delivery when the subtotal is below the minimum', () => {
    const seller = baseSeller({ minOrderAmountForDelivery: 500 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR, null, null, 300);
    expect(result.deliverable).toBe(false);
    expect(result.reason).toMatch(/500/);
  });

  it('allows delivery when the subtotal meets the minimum', () => {
    const seller = baseSeller({ minOrderAmountForDelivery: 500 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR, null, null, 500);
    expect(result.deliverable).toBe(true);
  });
});

describe('getDeliveryFeeForSeller — configurable free-delivery threshold', () => {
  it('is free once the subtotal reaches the sellers configured threshold', () => {
    const seller = baseSeller({ freeDeliveryThreshold: 1500, deliveryFeeType: 'fixed', deliveryFeeFixed: 200 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR, null, null, 1500);
    expect(result.fee).toBe(0);
    expect(result.deliverable).toBe(true);
  });

  it('charges the normal fee below the threshold', () => {
    const seller = baseSeller({ freeDeliveryThreshold: 1500, deliveryFeeType: 'fixed', deliveryFeeFixed: 200 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR, null, null, 1000);
    expect(result.fee).toBe(200);
  });
});

describe('getDeliveryFeeForSeller — zone-based pricing', () => {
  it('uses a matching named zones fee instead of the fixed/distance formula', () => {
    const seller = baseSeller({
      deliveryFeeType: 'fixed',
      deliveryFeeFixed: 999,
      deliveryZones: [{ name: 'Clifton Zone', cities: [], areas: ['Clifton'], fee: 75 }],
    });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.fee).toBe(75);
  });

  it('rejects delivery outright when the address matches no configured zone', () => {
    // Defining zones at all is the seller declaring their complete delivery
    // coverage — an unmatched address is out of range, not a silent
    // fall-through to the fixed/distance formula or platform default fee.
    const seller = baseSeller({
      deliveryFeeType: 'fixed',
      deliveryFeeFixed: 250,
      deliveryZones: [{ name: 'Somewhere Else', cities: [], areas: ['DHA'], fee: 75 }],
    });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.deliverable).toBe(false);
    expect(result.fee).toBe(0);
    expect(result.reason).toMatch(/delivery zones/i);
  });
});

describe('getDeliveryFeeForSeller — tiered distance pricing', () => {
  const tiers = [
    { maxKm: 3, fee: 50 },
    { maxKm: 5, fee: 100 },
    { maxKm: 10, fee: 175 },
  ];

  it('picks the correct bracket for a ~3.4km delivery (falls in the 5km tier)', () => {
    const seller = baseSeller({ deliveryFeeType: 'distance', distancePricingTiers: tiers, deliveryFeeBase: 999, deliveryFeePerKm: 999 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.fee).toBe(100);
  });

  it('falls back to the linear formula beyond the last bracket', () => {
    const seller = baseSeller({ deliveryFeeType: 'distance', distancePricingTiers: tiers, deliveryFeeBase: 50, deliveryFeePerKm: 10 });
    const result = getDeliveryFeeForSeller(seller, LAHORE_ADDR); // ~1180km, beyond the 10km tier ceiling
    expect(result.fee).toBeGreaterThan(175);
  });

  it('uses the plain linear formula when no tiers are configured', () => {
    const seller = baseSeller({ deliveryFeeType: 'distance', deliveryFeeBase: 100, deliveryFeePerKm: 20 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    const expectedKm = haversineKm(SELLER_LAT, SELLER_LNG, NEARBY_ADDR.latitude, NEARBY_ADDR.longitude);
    expect(result.fee).toBe(Math.round(100 + 20 * expectedKm));
  });
});

describe('getDeliveryFeeForSeller — existing free-area/radius/fixed behavior still works', () => {
  it('is free within the free-delivery radius', () => {
    const seller = baseSeller({ freeDeliveryRadiusKm: 5 });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.fee).toBe(0);
    expect(result.deliverable).toBe(true);
  });

  it('is free in a listed free-delivery area', () => {
    const seller = baseSeller({ freeDeliveryAreas: ['Clifton'] });
    const result = getDeliveryFeeForSeller(seller, NEARBY_ADDR);
    expect(result.fee).toBe(0);
  });

  it('falls back to the platform default fee with no seller config at all', () => {
    const seller = baseSeller();
    const result = getDeliveryFeeForSeller(seller, { area: 'Somewhere', city: 'Karachi' });
    expect(result.fee).toBe(150); // Karachi/Lahore/Islamabad bump
    expect(result.deliverable).toBe(true);
  });
});
