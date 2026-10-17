import { getDeliveryFeeForSeller, haversineKm, PlatformDeliveryPricing } from '../src/utils/deliveryFee';

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

describe('getDeliveryFeeForSeller — community rules', () => {
  const HOME = 'comm-askari-11';
  const NEIGHBOR = 'comm-askari-10';
  const FAR = 'comm-dha';
  const rule = (communityId: string, fee: number, extra: Record<string, unknown> = {}) => ({
    communityId,
    fee,
    freeAbove: null,
    minOrderAmount: null,
    isEnabled: true,
    ...extra,
  });
  const communitySeller = (overrides: Partial<Record<string, unknown>> = {}) =>
    baseSeller({
      communityId: HOME,
      allowCrossCommunity: true,
      community: { crossCommunityEnabled: true },
      communityDeliveries: [],
      deliveryFeeType: 'fixed',
      deliveryFeeFixed: 200,
      ...overrides,
    });
  const addr = (communityId: string | null) => ({ area: 'Askari 11', city: 'Lahore', communityId });

  it('uses the fee the seller fixed for the buyer\'s community', () => {
    const seller = communitySeller({ communityDeliveries: [rule(HOME, 40), rule(NEIGHBOR, 120)] });
    expect(getDeliveryFeeForSeller(seller, addr(HOME))).toMatchObject({ deliverable: true, fee: 40 });
    expect(getDeliveryFeeForSeller(seller, addr(NEIGHBOR))).toMatchObject({ deliverable: true, fee: 120 });
  });

  it('refuses a community the seller has not set up once any terms exist', () => {
    const seller = communitySeller({ communityDeliveries: [rule(HOME, 40)] });
    const result = getDeliveryFeeForSeller(seller, addr(FAR));
    expect(result.deliverable).toBe(false);
    expect(result.reason).toMatch(/community/i);
  });

  it('refuses a community the seller explicitly disabled', () => {
    const seller = communitySeller({ communityDeliveries: [rule(HOME, 40), rule(NEIGHBOR, 120, { isEnabled: false })] });
    expect(getDeliveryFeeForSeller(seller, addr(NEIGHBOR)).deliverable).toBe(false);
  });

  it('falls back to the legacy seller-wide policy when no community terms exist', () => {
    const seller = communitySeller();
    expect(getDeliveryFeeForSeller(seller, addr(NEIGHBOR))).toMatchObject({ deliverable: true, fee: 200 });
  });

  it('ignores community rules when the address has no community', () => {
    const seller = communitySeller({ communityDeliveries: [rule(HOME, 40)] });
    expect(getDeliveryFeeForSeller(seller, addr(null))).toMatchObject({ deliverable: true, fee: 200 });
  });

  it('refuses other communities when the seller opted out of cross-community delivery', () => {
    const seller = communitySeller({ allowCrossCommunity: false });
    const outside = getDeliveryFeeForSeller(seller, addr(NEIGHBOR));
    expect(outside.deliverable).toBe(false);
    expect(outside.reason).toMatch(/own community/i);
    expect(getDeliveryFeeForSeller(seller, addr(HOME)).deliverable).toBe(true);
  });

  it('refuses other communities when the seller\'s community has cross-community delivery off', () => {
    const seller = communitySeller({ community: { crossCommunityEnabled: false } });
    expect(getDeliveryFeeForSeller(seller, addr(NEIGHBOR)).deliverable).toBe(false);
  });

  it('applies the community free-above threshold and minimum order', () => {
    const seller = communitySeller({
      communityDeliveries: [rule(HOME, 40, { freeAbove: 1000, minOrderAmount: 300 })],
    });
    expect(getDeliveryFeeForSeller(seller, addr(HOME), null, null, 200)).toMatchObject({ deliverable: false });
    expect(getDeliveryFeeForSeller(seller, addr(HOME), null, null, 500)).toMatchObject({ deliverable: true, fee: 40 });
    expect(getDeliveryFeeForSeller(seller, addr(HOME), null, null, 1000)).toMatchObject({ deliverable: true, fee: 0 });
  });

  it('accepts Prisma Decimal-like fee values', () => {
    const decimalLike = { toString: () => '55.00', valueOf: () => 55 };
    const seller = communitySeller({ communityDeliveries: [rule(HOME, 0, { fee: decimalLike })] });
    expect(getDeliveryFeeForSeller(seller, addr(HOME)).fee).toBe(55);
  });
});

describe('getDeliveryFeeForSeller — the order amount that waives a fee that is being charged', () => {
  const HOME = 'comm-askari-11';
  const rule = (communityId: string, fee: number, freeAbove: number | null) => ({ communityId, fee, freeAbove, minOrderAmount: null, isEnabled: true });
  const seller = (overrides: Partial<Record<string, unknown>> = {}) =>
    baseSeller({ communityId: HOME, allowCrossCommunity: true, community: { crossCommunityEnabled: true }, communityDeliveries: [], deliveryFeeType: 'fixed', deliveryFeeFixed: 90, ...overrides });
  const addr = (communityId: string | null) => ({ area: 'Askari 11', city: 'Lahore', communityId });

  it('is the kitchen\'s own threshold while the fee is charged, and the same amount once it has waived the fee', () => {
    const own = seller({ freeDeliveryThreshold: 1200 });
    expect(getDeliveryFeeForSeller(own, addr(null), null, null, 700)).toMatchObject({ fee: 90, freeAbove: 1200 });
    expect(getDeliveryFeeForSeller(own, addr(null), null, null, 1199)).toMatchObject({ fee: 90, freeAbove: 1200 });
    expect(getDeliveryFeeForSeller(own, addr(null), null, null, 1200)).toMatchObject({ fee: 0, freeAbove: 1200 });
    expect(getDeliveryFeeForSeller(own, addr(null), null, null, 5000)).toMatchObject({ fee: 0, freeAbove: 1200 });
  });

  it('is the buyer\'s community amount once that has waived the fee', () => {
    const withTerms = seller({ freeDeliveryThreshold: 900, communityDeliveries: [rule(HOME, 40, 1500)] });
    expect(getDeliveryFeeForSeller(withTerms, addr(HOME), null, null, 1499)).toMatchObject({ fee: 40, freeAbove: 1500 });
    expect(getDeliveryFeeForSeller(withTerms, addr(HOME), null, null, 1500)).toMatchObject({ fee: 0, freeAbove: 1500 });
  });

  it('is absent when the kitchen has no such rule, or the fee is zero for another reason', () => {
    expect(getDeliveryFeeForSeller(seller(), addr(null), null, null, 700)).not.toHaveProperty('freeAbove');
    expect(getDeliveryFeeForSeller(seller({ deliveryFeeFixed: 0, freeDeliveryThreshold: 1200 }), addr(null), null, null, 100)).not.toHaveProperty('freeAbove');
    // delivery is free to this area whatever the order comes to: the amount is not what makes it free
    const freeArea = seller({ freeDeliveryThreshold: 1200, freeDeliveryAreas: ['Askari 11'] });
    const result = getDeliveryFeeForSeller(freeArea, addr(null), null, null, 300);
    expect(result.fee).toBe(0);
    expect(result).not.toHaveProperty('freeAbove');
  });

  it('is the buyer\'s community rule when the kitchen has terms for the community, not the kitchen-wide threshold', () => {
    const withTerms = seller({ freeDeliveryThreshold: 1200, communityDeliveries: [rule(HOME, 40, 1500)] });
    expect(getDeliveryFeeForSeller(withTerms, addr(HOME), null, null, 500)).toMatchObject({ fee: 40, freeAbove: 1500 });
    const termsWithoutOne = seller({ freeDeliveryThreshold: 1200, communityDeliveries: [rule(HOME, 40, null)] });
    expect(getDeliveryFeeForSeller(termsWithoutOne, addr(HOME), null, null, 500)).not.toHaveProperty('freeAbove');
    // a buyer with no community falls through to the kitchen-wide policy
    expect(getDeliveryFeeForSeller(withTerms, addr(null), null, null, 500)).toMatchObject({ fee: 90, freeAbove: 1200 });
  });

  it('is never offered for a fee a Nuray rider charges (the kitchen pays it, the customer\'s is zero)', () => {
    const pricing: PlatformDeliveryPricing = { perKm: 20, includedKm: 3, maxKm: 20, fallbackBaseFee: 150, communities: new Map([[HOME, { centerLat: 31.5, centerLng: 74.35, sameCommunityFee: 100, crossCommunityBaseFee: 150 }]]) };
    const result = getDeliveryFeeForSeller(seller({ freeDeliveryThreshold: 1200 }), addr(HOME), null, null, 300, { pricing });
    expect(result.pricing).toBeDefined();
    expect(result).not.toHaveProperty('freeAbove');
  });

  it('is not offered when the kitchen will not deliver at all', () => {
    const result = getDeliveryFeeForSeller(seller({ freeDeliveryThreshold: 1200, maxDeliveryDistanceKm: 1 }), { ...addr(null), latitude: 31.5, longitude: 74.3 }, 24.8, 67.0, 300);
    expect(result.deliverable).toBe(false);
    expect(result).not.toHaveProperty('freeAbove');
  });
});
