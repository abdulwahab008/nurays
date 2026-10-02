/**
 * Nuray's delivery prices (fixed within a community, by distance to others) and
 * whole-rupee order totals.
 */
import { communityPairKey, getDeliveryFeeForSeller, platformDeliveryFee, PlatformDeliveryPricing } from '../src/utils/deliveryFee';
import { priceOrder } from '../src/utils/pricing';

const pricing: PlatformDeliveryPricing = {
  perKm: 20,
  includedKm: 3,
  maxKm: 20,
  fallbackBaseFee: 150,
  communities: new Map([
    ['askari', { centerLat: 31.5, centerLng: 74.35, sameCommunityFee: 100, crossCommunityBaseFee: 150 }],
    ['dha', { centerLat: 31.545, centerLng: 74.35, sameCommunityFee: 120, crossCommunityBaseFee: 180 }], // ~5 km north
    ['far', { centerLat: 31.8, centerLng: 74.35, sameCommunityFee: 100, crossCommunityBaseFee: 150 }], // ~33 km
  ]),
};

describe('Nuray delivery fee', () => {
  it('within a community: the fixed fee the admin set for it', () => {
    expect(platformDeliveryFee('askari', { communityId: 'askari' }, 2.5, pricing)).toMatchObject({ deliverable: true, fee: 100, pricing: 'same_community' });
  });

  it("to another community: the kitchen community's base + Rs 20 per km after 3 km, rounded up to Rs 10", () => {
    // 150 + (6.2 - 3) * 20 = 214 -> 220
    expect(platformDeliveryFee('askari', { communityId: 'dha' }, 6.2, pricing)).toMatchObject({ deliverable: true, fee: 220, pricing: 'cross_community' });
    // short hop: only the base
    expect(platformDeliveryFee('askari', { communityId: 'dha' }, 2, pricing).fee).toBe(150);
  });

  it('without exact locations it measures community centre to centre', () => {
    const r = platformDeliveryFee('askari', { communityId: 'dha' }, null, pricing);
    expect(r.distanceKm).toBeCloseTo(5, 0);
    expect(r.fee).toBe(200); // 150 + ~2 km * 20 = ~190 -> 200
  });

  it("an admin's price for a pair of communities replaces the distance formula, both ways", () => {
    const withPair = { ...pricing, pairFees: new Map([[communityPairKey('dha', 'askari'), 175]]) };
    expect(platformDeliveryFee('askari', { communityId: 'dha' }, 6.2, withPair)).toMatchObject({ fee: 175, pricing: 'community_pair' });
    expect(platformDeliveryFee('dha', { communityId: 'askari' }, 6.2, withPair).fee).toBe(175);
    // other trips are unaffected, and within a community its own fee still applies
    expect(platformDeliveryFee('askari', { communityId: 'askari' }, 1, withPair).fee).toBe(100);
  });

  it('a pair price also covers a trip longer than the usual limit', () => {
    const withPair = { ...pricing, pairFees: new Map([[communityPairKey('askari', 'far'), 400]]) };
    expect(platformDeliveryFee('askari', { communityId: 'far' }, null, withPair)).toMatchObject({ deliverable: true, fee: 400 });
  });

  it('nothing beyond the maximum distance', () => {
    expect(platformDeliveryFee('askari', { communityId: 'far' }, null, pricing)).toMatchObject({ deliverable: false });
  });

  it("applies when a Nuray rider delivers, not when the kitchen delivers itself", () => {
    const seller = {
      freeDeliveryAreas: [],
      communityId: 'askari',
      communityDeliveries: [{ communityId: 'askari', fee: 40, freeAbove: 500, isEnabled: true }],
    };
    const address = { communityId: 'askari' };
    expect(getDeliveryFeeForSeller({ ...seller, deliveryProvider: 'platform' }, address, null, null, 1000, { pricing }).fee).toBe(100);
    expect(getDeliveryFeeForSeller({ ...seller, deliveryProvider: 'self' }, address, null, null, 1000, { pricing }).fee).toBe(0); // its own free-above-500
    expect(getDeliveryFeeForSeller({ ...seller, deliveryProvider: 'self' }, address, null, null, 300, { pricing }).fee).toBe(40);
  });

  it('the kitchen still decides where it delivers and its minimum order', () => {
    const seller = {
      freeDeliveryAreas: [],
      communityId: 'askari',
      deliveryProvider: 'platform',
      communityDeliveries: [
        { communityId: 'askari', fee: 0, minOrderAmount: 500, isEnabled: true },
        { communityId: 'dha', fee: 0, isEnabled: false },
      ],
    };
    expect(getDeliveryFeeForSeller(seller, { communityId: 'dha' }, null, null, 1000, { pricing }).deliverable).toBe(false);
    expect(getDeliveryFeeForSeller(seller, { communityId: 'askari' }, null, null, 300, { pricing }).deliverable).toBe(false);
    expect(getDeliveryFeeForSeller(seller, { communityId: 'askari' }, null, null, 600, { pricing }).fee).toBe(100);
  });

  it('hub stock always goes with a Nuray rider', () => {
    const seller = { freeDeliveryAreas: [], communityId: 'askari', deliveryProvider: 'self', deliveryFeeType: 'fixed', deliveryFeeFixed: 60 };
    expect(getDeliveryFeeForSeller(seller, { communityId: 'askari' }, null, null, 500, { pricing, forcePlatform: true }).fee).toBe(100);
  });
});

describe('whole-rupee totals', () => {
  it('Rs 1,455 + Rs 150 delivery: GST 72.75 becomes 73 and the total Rs 1,678', () => {
    expect(priceOrder(1455, 150)).toEqual({ taxAmount: 73, totalAmount: 1678 });
  });
  it('rounds down too, never by Rs 0.50 or more', () => {
    expect(priceOrder(1449, 150)).toEqual({ taxAmount: 72, totalAmount: 1671 }); // 72.45
    for (const goods of [99.9, 333.33, 1234.56, 10]) {
      const { taxAmount, totalAmount } = priceOrder(goods, 100);
      expect(Number.isInteger(totalAmount)).toBe(true);
      expect(Math.abs(taxAmount - goods * 0.05)).toBeLessThanOrEqual(0.5);
    }
  });
});
