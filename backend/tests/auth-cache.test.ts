/**
 * The auth cache (LOAD-4): a signed-in request's account and session checks are answered from Redis when they can be,
 * every change to those facts forgets them at once (a suspended or signed-out account is refused on its next request),
 * an answer read just before a change cannot be put back after it, and a Redis that fails only sends checks to the database.
 */
const store = new Map<string, string>();
let redisOn = true;
let failing = false;
const fakeRedis = {
  get: jest.fn(async (key: string) => {
    if (failing) throw new Error('Redis is down');
    return store.get(key) ?? null;
  }),
  set: jest.fn(async (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
    if (failing) throw new Error('Redis is down');
    if (nx === 'NX' && store.has(key)) return null;
    store.set(key, value);
    return 'OK';
  }),
};
jest.mock('../src/config/redis', () => ({ getRedis: () => (redisOn ? fakeRedis : null), closeRedis: jest.fn() }));

const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({
  __esModule: true,
  default: { disconnectUser: jest.fn(), removeUserFromOrder: jest.fn(), syncRiderDuty: jest.fn() },
}));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/jobs/email.jobs', () => ({ queueVerificationEmail: jest.fn(), queuePasswordResetEmail: jest.fn(), queueEmail: jest.fn() }));
jest.mock('../src/services/account-notice.service', () => ({ notifyPasswordChanged: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/otp.service', () => ({ __esModule: true, default: { verifyOTP: jest.fn(async () => true) } }));

import type { Request, Response } from 'express';
import { authenticate } from '../src/middleware/auth.middleware';
import { getAuthUser, forgetAuthUsers } from '../src/services/auth-cache.service';
import { endAllSessions, endSession, isSessionActive } from '../src/services/session.service';
import { makeHubManager, removeHubManager, setUserStatus } from '../src/services/admin-people.service';
import { changeStaffRole, removeStaff, resetStaffPassword, setStaffStatus } from '../src/services/staff.service';
import authService from '../src/services/auth.service';
import { signInVerifiedEmail } from '../src/services/verified-email-sign-in.service';
import { generateToken } from '../src/utils/jwt';
import { logger } from '../src/utils/logger';

const ACTIVE = { id: 'u1', status: 'active', userType: 'customer', staffRole: null, tokensValidAfter: null };
let account: Record<string, unknown>;

beforeEach(() => {
  store.clear();
  redisOn = true;
  failing = false;
  account = { ...ACTIVE };
  Object.keys(db).forEach((k) => delete db[k]);
  db.user = {
    findUnique: jest.fn(async () => account),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(account, data)),
  };
  db.refreshToken = { findFirst: jest.fn(async () => ({ id: 'rt1' })), updateMany: jest.fn(async () => ({ count: 1 })) };
  db.seller = { updateMany: jest.fn() };
  db.rider = { updateMany: jest.fn(), count: jest.fn(async () => 0) };
  db.hubCenter = { updateMany: jest.fn() };
  db.$transaction = jest.fn(async (arg: unknown) => (typeof arg === 'function' ? arg(db) : Promise.all(arg as Promise<unknown>[])));
});

const run = async (token: string) => {
  const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
  const next = jest.fn();
  await authenticate(req, {} as Response, next);
  return { req, error: next.mock.calls[0][0] as unknown };
};
const access = (sid = 's1') => generateToken({ userId: 'u1', userType: 'customer', phone: '+923001110001', sid });
const prime = (userId: string) => store.set(`auth:user:${userId}`, JSON.stringify({ s: 'active', t: 'customer', r: null, v: null }));
const forgotten = (userId: string) => store.get(`auth:user:${userId}`) === '-';

describe('cache hits', () => {
  it('a second request reads neither the account nor the session from the database', async () => {
    expect((await run(access())).error).toBeUndefined();
    expect((await run(access())).error).toBeUndefined();
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
    expect(db.refreshToken.findFirst).toHaveBeenCalledTimes(1);
  });

  it('gives back the same fields it cached, the cut-off included', async () => {
    const cutOff = new Date('2026-11-01T10:00:00.123Z');
    account = { ...ACTIVE, userType: 'admin', staffRole: 'support', tokensValidAfter: cutOff };
    await getAuthUser('u1');
    expect(await getAuthUser('u1')).toEqual({ ...account, tokensValidAfter: cutOff });
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps each account under its own key', async () => {
    db.user.findUnique = jest.fn(async ({ where }: { where: { id: string } }) => ({ ...ACTIVE, id: where.id, userType: where.id === 'u2' ? 'seller' : 'customer' }));
    await getAuthUser('u1');
    expect(await getAuthUser('u2')).toMatchObject({ id: 'u2', userType: 'seller' });
    expect(await getAuthUser('u1')).toMatchObject({ id: 'u1', userType: 'customer' });
  });

  it('caches an ended session as ended, and never caches an account that does not exist', async () => {
    db.refreshToken.findFirst = jest.fn(async () => null);
    expect(await isSessionActive('gone')).toBe(false);
    expect(await isSessionActive('gone')).toBe(false);
    expect(db.refreshToken.findFirst).toHaveBeenCalledTimes(1);
    account = null as unknown as Record<string, unknown>;
    expect(await getAuthUser('nobody')).toBeNull();
    expect(store.has('auth:user:nobody')).toBe(false);
  });

  it('without Redis every check reads the database', async () => {
    redisOn = false;
    await run(access());
    await run(access());
    expect(db.user.findUnique).toHaveBeenCalledTimes(2);
    expect(db.refreshToken.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('forgetting', () => {
  it('a suspension is refused on the very next request, though the account was cached', async () => {
    await run(access());
    await setUserStatus('admin-1', 'u1', 'suspended');
    expect((await run(access())).error).toMatchObject({ statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
  });

  it('a device signed out is refused on the very next request', async () => {
    await run(access());
    await endSession('u1', 's1');
    db.refreshToken.findFirst = jest.fn(async () => null);
    expect((await run(access())).error).toMatchObject({ statusCode: 401, code: 'SESSION_REVOKED' });
  });

  it('signing out a session the account does not own leaves that session\'s cache entry alone', async () => {
    await run(access());
    db.refreshToken.updateMany = jest.fn(async () => ({ count: 0 }));
    await expect(endSession('someone-else', 's1')).resolves.toBe(false);
    expect((await run(access())).error).toBeUndefined();
    expect(db.refreshToken.findFirst).toHaveBeenCalledTimes(1);
  });

  it('an answer read before the change cannot be put back after it', async () => {
    let release!: () => void;
    const stale = { ...ACTIVE };
    db.user.findUnique = jest.fn(() => new Promise((resolve) => { release = () => resolve(stale); }));
    const reading = getAuthUser('u1');
    await new Promise((r) => setImmediate(r));
    await forgetAuthUsers('u1');
    release();
    await reading;
    expect(forgotten('u1')).toBe(true);
    account = { ...ACTIVE, status: 'suspended' };
    db.user.findUnique = jest.fn(async () => account);
    expect(await getAuthUser('u1')).toMatchObject({ status: 'suspended' });
  });

  it('endAllSessions forgets the account and every session it ended', async () => {
    prime('u1');
    store.set('auth:sid:a', '1');
    store.set('auth:sid:b', '1');
    db.refreshToken.updateManyAndReturn = jest.fn(async () => [{ familyId: 'a' }, { familyId: 'a' }, { familyId: 'b' }]);
    await endAllSessions('u1');
    expect(forgotten('u1')).toBe(true);
    expect([store.get('auth:sid:a'), store.get('auth:sid:b')]).toEqual(['0', '0']);
  });

  it('suspending or reactivating, and giving or taking the hub-manager role, forget the account', async () => {
    for (const status of ['suspended', 'active']) {
      prime('u1');
      await setUserStatus('admin-1', 'u1', status);
      expect(forgotten('u1')).toBe(true);
    }
    prime('u1');
    await makeHubManager('someone@example.com');
    expect(forgotten('u1')).toBe(true);
    prime('u1');
    await removeHubManager('u1');
    expect(forgotten('u1')).toBe(true);
  });

  it('every change to a staff member forgets them', async () => {
    account = { ...ACTIVE, id: 'st1', userType: 'admin', staffRole: 'admin', email: 'staff@example.com', profile: { fullName: 'Sana' } };
    const changes = [
      () => changeStaffRole('boss', 'st1', 'support'),
      () => setStaffStatus('boss', 'st1', 'suspended'),
      () => resetStaffPassword('boss', 'st1', 'Granite-Lantern-Orchard-77'),
      () => removeStaff('boss', 'st1'),
    ];
    for (const change of changes) {
      account.userType = 'admin';
      prime('st1');
      await change();
      expect(forgotten('st1')).toBe(true);
    }
  });

  it('a password reset forgets the account', async () => {
    prime('u1');
    db.passwordReset = {
      findFirst: jest.fn(async () => ({ user: { email: 'a@example.com', phone: '+923001110001', userType: 'customer', profile: null } })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ userId: 'u1' })),
    };
    await authService.resetPassword('token', 'Granite-Lantern-Orchard-77');
    expect(forgotten('u1')).toBe(true);
  });

  it('proving a phone number forgets the account that only claimed it', async () => {
    prime('squatter');
    db.user.findUnique = jest.fn(async () => ({ id: 'squatter', phoneVerified: false }));
    db.user.update = jest.fn(async () => ({ phone: '+923001110001', phoneVerified: true }));
    await authService.verifyPhone('u1', '03001110001', '123456');
    expect(forgotten('squatter')).toBe(true);
  });

  it("a provider's sign-in to a never-verified address forgets the account whose sessions it voided", async () => {
    prime('u1');
    db.user.findFirst = jest.fn(async () => ({ ...ACTIVE, phone: '+923001110001', emailVerified: false, profile: null }));
    db.user.update = jest.fn(async () => ({ ...ACTIVE, phone: '+923001110001', email: 'a@example.com', profile: null }));
    db.refreshToken.create = jest.fn(async () => ({}));
    await signInVerifiedEmail({ email: 'a@example.com', name: 'A', picture: null });
    expect(forgotten('u1')).toBe(true);
  });
});

describe('when Redis fails', () => {
  it('answers from the database, warns once, and stops asking Redis for a while', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    let now = Date.now() + 3_600_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    failing = true;
    for (let i = 0; i < 3; i++) expect((await run(access())).error).toBeUndefined();
    expect(db.user.findUnique).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fakeRedis.get).toHaveBeenCalledTimes(1);

    await expect(forgetAuthUsers('u1')).resolves.toBeUndefined();

    failing = false;
    now += 6_000;
    await run(access());
    expect(fakeRedis.get).toHaveBeenCalledTimes(3);
    clock.mockRestore();
    warn.mockRestore();
  });
});
