/**
 * Delivery addresses carry no community of their own, so the community delivery
 * rules rely on resolveCommunityIdForAddress to place an address.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    community: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { communityService } from '../src/services/community.service';
import prisma from '../src/config/database';

const db = prisma as any;

const community = (id: string, name: string, lat: number, lng: number, radiusKm = 3, city = 'Lahore') => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  city,
  centerLatitude: lat,
  centerLongitude: lng,
  radiusKm,
});

const ASKARI_11 = community('c11', 'Askari 11', 31.4, 74.4);
const ASKARI_10 = community('c10', 'Askari 10', 31.5, 74.5);

beforeEach(() => {
  db.community.findMany.mockReset().mockResolvedValue([ASKARI_11, ASKARI_10]);
  db.user.findUnique.mockReset().mockResolvedValue(null);
});

describe('resolveCommunityIdForAddress', () => {
  it('places an address by GPS inside a community radius', async () => {
    const id = await communityService.resolveCommunityIdForAddress({ area: 'x', city: 'Lahore', latitude: 31.401, longitude: 74.401 });
    expect(id).toBe('c11');
  });

  it('does not place a GPS point outside every community radius', async () => {
    const id = await communityService.resolveCommunityIdForAddress({ area: 'Gulberg', city: 'Lahore', latitude: 31.9, longitude: 74.9 });
    expect(id).toBeNull();
  });

  it('places an address by its area name when there is no GPS', async () => {
    expect(await communityService.resolveCommunityIdForAddress({ area: 'askari 10', city: 'Lahore' })).toBe('c10');
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Sector C, Askari 11', city: 'Lahore' })).toBe('c11');
  });

  it("falls back to the buyer's community when the address is in the same city", async () => {
    db.user.findUnique.mockResolvedValue({ primaryCommunityId: 'c11' });
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Somewhere', city: 'Lahore' }, 'u1')).toBe('c11');
  });

  it("does not use the buyer's community for an address in another city", async () => {
    db.user.findUnique.mockResolvedValue({ primaryCommunityId: 'c11' });
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Clifton', city: 'Karachi' }, 'u1')).toBeNull();
  });

  it('returns null when there are no active communities', async () => {
    db.community.findMany.mockResolvedValue([]);
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Askari 11', city: 'Lahore' })).toBeNull();
  });
});
