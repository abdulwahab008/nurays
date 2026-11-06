/**
 * The kitchens list carries each kitchen's delivery fee and time for the visitor's area or address, the same quote the dish
 * cards show, so a buyer sees what delivery costs before checkout. Without an area or address nothing is quoted.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { seller: { findMany: jest.fn() } },
}));
jest.mock('../src/services/product.service', () => ({
  computeCustomerFacingSellerInfo: jest.fn(),
}));

import prisma from '../src/config/database';
import { computeCustomerFacingSellerInfo } from '../src/services/product.service';
import { listPublicSellers } from '../src/services/public-seller.service';

const db = prisma as any;
const quote = computeCustomerFacingSellerInfo as jest.Mock;

const row = (id: string) => ({
  id,
  businessName: `Kitchen ${id}`,
  ratingAverage: '0',
  totalReviews: 0,
  trendScore: 0,
  status: 'active',
  scheduleMode: 'always',
  operatingHours: null,
  availabilityOverride: null,
  availabilityOverrideUntil: null,
  availabilityNote: null,
  minPrepTimeMinutes: 20,
  community: { id: 'gulshan', name: 'Gulshan-e-Iqbal', slug: 'gulshan', city: 'Karachi', deliveryBaseFee: 50, crossCommunityEnabled: true },
  communityDeliveries: [],
  user: { profile: null },
  products: [],
  _count: { products: 0, reviews: 0 },
});

beforeEach(() => {
  db.seller.findMany.mockReset();
  quote.mockReset();
});

it('quotes delivery to the chosen area for every kitchen', async () => {
  db.seller.findMany.mockResolvedValue([row('a'), row('b')]);
  quote.mockImplementation(async (s: { id: string }) => ({
    isAcceptingOrders: true,
    acceptingReason: null,
    delivery: { deliverable: s.id === 'a', fee: 50, distanceKm: null, reason: null, estimatedMinMinutes: 40, estimatedMaxMinutes: 65 },
  }));

  const list = await listPublicSellers({ customerCommunityId: 'gulshan' });

  expect(quote).toHaveBeenCalledTimes(2);
  expect(quote.mock.calls[0].slice(1)).toEqual([null, null, 'gulshan']);
  expect(list.map((k) => k.delivery?.deliverable)).toEqual([true, false]);
  expect(list[0].delivery).toMatchObject({ fee: 50, estimatedMinMinutes: 40, estimatedMaxMinutes: 65 });
});

it('passes a saved address on, and ignores coordinates that are not numbers', async () => {
  db.seller.findMany.mockResolvedValue([row('a')]);
  quote.mockResolvedValue({ isAcceptingOrders: true, acceptingReason: null, delivery: null });

  await listPublicSellers({ customerLat: '24.92', customerLng: '67.09' });
  expect(quote.mock.calls[0].slice(1)).toEqual([24.92, 67.09, null]);

  quote.mockClear();
  await listPublicSellers({ customerLat: 'x', customerLng: '67.09' });
  expect(quote).not.toHaveBeenCalled();
});

it('quotes nothing when neither an area nor an address is known', async () => {
  db.seller.findMany.mockResolvedValue([row('a')]);
  const list = await listPublicSellers({});
  expect(quote).not.toHaveBeenCalled();
  expect(list[0].delivery).toBeNull();
});
