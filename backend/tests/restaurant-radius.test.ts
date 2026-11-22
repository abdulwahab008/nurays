/**
 * A restaurant is shown to, and takes orders from, only customers within 5 km of it; home kitchens are not gated by
 * distance. The database is a double: what is under test is the filter and the checkout check.
 */
const db = {
  seller: { findMany: jest.fn() },
  community: { findFirst: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import { assertRestaurantReaches, buyerPoint, restaurantReaches, restaurantsNearWhere } from '../src/utils/liveArea';

// DHA Phase 5, Lahore, and points about 3 km and 9 km east of it.
const dha5 = { lat: 31.47, lng: 74.4 };
const near = { lat: 31.47, lng: 74.4318 };
const far = { lat: 31.47, lng: 74.4952 };
const restaurant = (id: string, at: { lat: number; lng: number }) => ({ id, businessType: 'restaurant', latitude: at.lat, longitude: at.lng });

beforeEach(() => {
  db.seller.findMany.mockReset();
  db.community.findFirst.mockReset();
});

describe('the 5 km restaurant rule', () => {
  it('shows a restaurant within 5 km and hides one further away; home kitchens always pass', () => {
    expect(restaurantReaches(restaurant('a', near), dha5)).toBe(true);
    expect(restaurantReaches(restaurant('b', far), dha5)).toBe(false);
    expect(restaurantReaches({ businessType: 'home_kitchen', latitude: far.lat, longitude: far.lng }, dha5)).toBe(true);
  });

  it('shows no restaurant when the customer gives no location, or the restaurant has no pin', () => {
    expect(restaurantReaches(restaurant('a', near), null)).toBe(false);
    expect(restaurantReaches({ businessType: 'restaurant', latitude: null, longitude: null }, dha5)).toBe(false);
  });

  it('builds a seller filter that keeps every non-restaurant and only the near restaurants', async () => {
    db.seller.findMany.mockResolvedValue([restaurant('near', near), restaurant('far', far)]);
    expect(await restaurantsNearWhere(dha5)).toEqual({ OR: [{ businessType: { not: 'restaurant' } }, { id: { in: ['near'] } }] });
    expect(await restaurantsNearWhere(null)).toEqual({ businessType: { not: 'restaurant' } });
  });

  it("measures from the customer's location, else from the centre of the area they chose", async () => {
    expect(await buyerPoint(31.5, 74.3, 'dha-phase-5')).toEqual({ lat: 31.5, lng: 74.3 });
    expect(db.community.findFirst).not.toHaveBeenCalled();
    db.community.findFirst.mockResolvedValue({ centerLatitude: '31.47', centerLongitude: '74.40' });
    expect(await buyerPoint(null, null, 'dha-phase-5')).toEqual(dha5);
    expect(await buyerPoint(null, null, null)).toBeNull();
  });

  it('refuses a delivery from a restaurant more than 5 km from the address', () => {
    const seller = { businessName: 'Far Grill', ...restaurant('far', far) };
    expect(() => assertRestaurantReaches(seller, dha5)).toThrow(expect.objectContaining({ code: 'RESTAURANT_TOO_FAR' }));
    expect(() => assertRestaurantReaches({ ...seller, latitude: near.lat, longitude: near.lng }, dha5)).not.toThrow();
  });
});
