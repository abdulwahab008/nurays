/**
 * Step 1 of the audit's remaining decisions: what a kitchen sees of the customer (PRIV-4), the cap on "this account
 * already exists" answers (SEC-11), and pins outside every community (DELIV-3).
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/utils/attemptBudget', () => {
  const counts = new Map<string, number>();
  return {
    budgetUsed: jest.fn(async (k: string) => counts.get(k) ?? 0),
    budgetAdd: jest.fn(async (k: string) => { counts.set(k, (counts.get(k) ?? 0) + 1); return counts.get(k); }),
    budgetReset: jest.fn(async (k: string) => counts.delete(k)),
  };
});

import { CONTACT_AFTER_DELIVERY_MS, firstName, kitchenContactRule, withoutDoor } from '../src/utils/kitchenOrderView';
import { guardAccountProbe } from '../src/middleware/accountProbe';
import { AppError } from '../src/middleware/errorHandler';
import { communityService } from '../src/services/community.service';

describe('what a kitchen sees of the customer (PRIV-4)', () => {
  const self = { deliveryType: 'home_delivery', deliveryProvider: 'self' };
  const rider = { deliveryType: 'home_delivery', deliveryProvider: 'platform' };
  const pickup = { deliveryType: 'self_pickup', deliveryProvider: null };

  it('nothing until the kitchen accepts the order', () => {
    expect(kitchenContactRule({ ...self, orderStatus: 'pending' })).toBe('not_accepted');
    expect(kitchenContactRule({ ...pickup, orderStatus: 'pending' })).toBe('not_accepted');
  });
  it('the phone and door from accepting until delivery, when the kitchen hands it over itself', () => {
    for (const s of ['confirmed', 'preparing', 'ready', 'dispatched', 'in_transit']) {
      expect(kitchenContactRule({ ...self, orderStatus: s })).toBeNull();
      expect(kitchenContactRule({ ...pickup, orderStatus: s })).toBeNull();
    }
  });
  it('never when a Nuray rider delivers', () => {
    for (const s of ['pending', 'preparing', 'delivered']) expect(kitchenContactRule({ ...rider, orderStatus: s, deliveredAt: new Date() })).toBe('nuray_rider');
  });
  it('for a day after delivery, then not; never once cancelled', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(kitchenContactRule({ ...self, orderStatus: 'delivered', deliveredAt: new Date(now.getTime() - CONTACT_AFTER_DELIVERY_MS) }, null, now)).toBeNull();
    expect(kitchenContactRule({ ...self, orderStatus: 'delivered', deliveredAt: new Date(now.getTime() - CONTACT_AFTER_DELIVERY_MS - 1) }, null, now)).toBe('closed');
    expect(kitchenContactRule({ ...self, orderStatus: 'cancelled' })).toBe('closed');
  });
  it('an order placed before the provider was stored follows the kitchen setting', () => {
    expect(kitchenContactRule({ deliveryType: 'home_delivery', orderStatus: 'preparing' }, 'self')).toBeNull();
    expect(kitchenContactRule({ deliveryType: 'home_delivery', orderStatus: 'preparing' }, 'platform')).toBe('nuray_rider');
  });
  it('keeps the area and city, drops the door; the first name only', () => {
    expect(withoutDoor({ addressLine1: 'House 5, Street 2', houseNumber: '5', landmark: 'mosque', area: 'Askari 11', city: 'Lahore' }))
      .toEqual({ addressLine1: null, houseNumber: null, landmark: null, area: 'Askari 11', city: 'Lahore' });
    expect(firstName('  Ayesha Khan ')).toBe('Ayesha');
    expect(firstName(null)).toBeNull();
  });
});

describe('"this account already exists", counted per network address (SEC-11)', () => {
  const exists = () => Promise.reject(new AppError('Phone number already registered', 409, 'PHONE_EXISTS'));
  it('answers plainly a few times, then 429 for that address only', async () => {
    const req = { ip: '203.0.113.50' };
    for (let i = 0; i < 3; i++) await expect(guardAccountProbe(req, exists, 3)).rejects.toMatchObject({ code: 'PHONE_EXISTS' });
    await expect(guardAccountProbe(req, async () => 'ok', 3)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    await expect(guardAccountProbe({ ip: '198.51.100.7' }, async () => 'ok', 3)).resolves.toBe('ok');
  });
  it('other mistakes (a weak password, a wrong code) are not counted', async () => {
    const req = { ip: '203.0.113.51' };
    for (let i = 0; i < 5; i++) await expect(guardAccountProbe(req, () => Promise.reject(new AppError('weak', 400, 'WEAK_PASSWORD')), 3)).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(guardAccountProbe(req, async () => 'ok', 3)).resolves.toBe('ok');
  });
});

describe('a pin outside every community (DELIV-3)', () => {
  const askari11 = { id: 'c1', name: 'Askari 11', slug: 'askari-11', city: 'Lahore', centerLatitude: 31.4504, centerLongitude: 74.3587, radiusKm: 2, isActive: true };
  beforeEach(() => {
    db.community = { findMany: jest.fn(async () => [askari11]) };
    db.user = { findUnique: jest.fn(async () => ({ primaryCommunityId: 'c1' })) };
  });
  it('is not filed under the community its typed area names', async () => {
    // 20 km away, but typed as "Askari 11"
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Askari 11', city: 'Lahore', latitude: 31.62, longitude: 74.36 }, 'u1')).toBeNull();
    // inside the circle it is
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Somewhere', city: 'Lahore', latitude: 31.451, longitude: 74.359 }, 'u1')).toBe('c1');
    // with no pin the typed area still helps
    expect(await communityService.resolveCommunityIdForAddress({ area: 'Askari 11', city: 'Lahore' }, 'u1')).toBe('c1');
  });
  it('is outside the service area; no pin, or no community at all, is not', async () => {
    expect(await communityService.pinOutsideEveryCommunity(31.62, 74.36)).toBe(true);
    expect(await communityService.pinOutsideEveryCommunity(31.451, 74.359)).toBe(false);
    expect(await communityService.pinOutsideEveryCommunity(null, null)).toBe(false);
    db.community.findMany = jest.fn(async () => []);
    expect(await communityService.pinOutsideEveryCommunity(31.62, 74.36)).toBe(false);
  });
});
