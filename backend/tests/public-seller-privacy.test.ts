/**
 * The public kitchen endpoints are open to anyone: they name the kitchen by its seller id and
 * never hand out the owner's account id, e-mail, phone or any payment detail.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    seller: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));

import prisma from '../src/config/database';
import { getPublicSellers, getPublicSellerById } from '../src/controllers/seller.controller';

const db = prisma as any;

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

const FORBIDDEN = ['userId', 'email', 'phone', 'passwordHash', 'bankAccountNumber', 'jazzcashNumber', 'easypaisaNumber', 'latitude', 'longitude'];

/** A kitchen row as the database could return it, with the private columns a query might drag along. */
const sellerRow = (over: Record<string, unknown> = {}) => ({
  id: 'seller-1',
  userId: 'user-77',
  businessName: 'Sara Kitchen',
  businessNameUrdu: null,
  description: 'Home cooking',
  coverImageUrl: null,
  ratingAverage: '4.5',
  totalReviews: 3,
  trendScore: 1.234,
  ratingScore: 4,
  status: 'active',
  isVerified: true,
  verificationStatus: 'approved',
  scheduleMode: 'always',
  operatingHours: null,
  availabilityOverride: null,
  availabilityOverrideUntil: null,
  availabilityNote: null,
  minPrepTimeMinutes: 30,
  minOrderAmountForDelivery: null,
  freeDeliveryThreshold: null,
  deliveryFeeType: null,
  deliveryFeeFixed: null,
  deliveryFeeBase: null,
  deliveryFeePerKm: null,
  freeDeliveryRadiusKm: null,
  freeDeliveryAreas: [],
  orderCutoffTime: null,
  preOrderOnly: false,
  storeNotice: null,
  businessType: 'home_kitchen',
  mealCategories: [],
  allowCrossCommunity: false,
  community: { id: 'com-1', name: 'Askari 11', slug: 'askari-11', city: 'Lahore' },
  user: { id: 'user-77', email: 'sara@example.com', phone: '+923001112222', profile: { fullName: 'Sara Khan', avatarUrl: null, city: 'Lahore', area: 'Askari 11' } },
  products: [],
  reviews: [],
  _count: { products: 0, reviews: 0 },
  bankAccountNumber: 'PK00BANK000000',
  jazzcashNumber: '03001112222',
  latitude: 31.4,
  longitude: 74.4,
  ...over,
});

function fakeRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

beforeEach(() => {
  db.seller.findMany.mockReset();
  db.seller.findFirst.mockReset();
});

describe('GET /sellers', () => {
  it("lists kitchens by seller id and never returns the owner's account, contact or payment details", async () => {
    db.seller.findMany.mockResolvedValue([sellerRow()]);
    const res = fakeRes();
    await getPublicSellers({ query: {} } as any, res);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 'seller-1', businessName: 'Sara Kitchen', chef: { name: 'Sara Khan' } });
    const keys = keysOf(res.body);
    for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
    const json = JSON.stringify(res.body);
    for (const secret of ['user-77', 'sara@example.com', '+923001112222', 'PK00BANK000000']) expect(json).not.toContain(secret);
  });

  it("does not even load the owner's account id", async () => {
    db.seller.findMany.mockResolvedValue([]);
    await getPublicSellers({ query: {} } as any, fakeRes());
    const select = db.seller.findMany.mock.calls[0][0].include.user.select;
    expect(Object.keys(select)).toEqual(['profile']);
  });
});

describe('GET /sellers/:id', () => {
  it('returns the kitchen page without the owner account details', async () => {
    db.seller.findFirst.mockResolvedValue(sellerRow());
    const res = fakeRes();
    await getPublicSellerById({ params: { id: 'seller-1' } } as any, res);

    expect(res.body.data).toMatchObject({ id: 'seller-1', businessName: 'Sara Kitchen' });
    const keys = keysOf(res.body);
    for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
    const json = JSON.stringify(res.body);
    for (const secret of ['user-77', 'sara@example.com', '+923001112222', 'PK00BANK000000']) expect(json).not.toContain(secret);
  });

  it('still finds a kitchen by its owner id, so older links keep working, and answers with the seller id', async () => {
    db.seller.findFirst.mockResolvedValue(sellerRow());
    const res = fakeRes();
    await getPublicSellerById({ params: { id: 'user-77' } } as any, res);
    const args = db.seller.findFirst.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ id: 'user-77' }, { userId: 'user-77' }]);
    expect(Object.keys(args.include.user.select)).toEqual(['profile']);
    expect(res.body.data.id).toBe('seller-1');
  });

  it('answers 404 for a kitchen that is not public', async () => {
    db.seller.findFirst.mockResolvedValue(null);
    await expect(getPublicSellerById({ params: { id: 'nope' } } as any, fakeRes())).rejects.toMatchObject({ code: 'SELLER_NOT_FOUND' });
  });
});
