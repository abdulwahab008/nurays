/**
 * Sign in with Apple: the token is checked by utils/apple-id-token (tested on its own); what is tested here is the
 * service around it: which audiences it allows, how each failure is told to the person, and that a verified Apple
 * identity signs in by the same rules as Google (an active account only, never an admin, a new customer otherwise),
 * named with the name Apple gave the app at the first sign-in.
 */
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 0 })) },
  },
}));
jest.mock('../src/utils/apple-id-token', () => {
  const actual = jest.requireActual('../src/utils/apple-id-token');
  return { ...actual, verifyAppleIdToken: jest.fn() };
});

import prisma from '../src/config/database';
import { appleAudiences, signInWithApple } from '../src/services/apple-auth.service';
import { AppleIdTokenError, verifyAppleIdToken } from '../src/utils/apple-id-token';

const db = prisma as any;
const verify = verifyAppleIdToken as jest.Mock;
const identity = { subject: '001.a.1', email: 'x7k2@privaterelay.appleid.com', name: '', picture: null };
const existing = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: identity.email, phone: '+923001234567', userType: 'customer', status: 'active', emailVerified: true, passwordHash: null, profile: null, ...over,
});

beforeEach(() => {
  process.env.APPLE_CLIENT_IDS = 'pk.nuray.app';
  verify.mockReset().mockResolvedValue(identity);
  db.user.findFirst.mockReset();
  db.user.update.mockReset().mockImplementation(async ({ data }: any) => ({ ...existing(), ...data }));
  db.user.create.mockReset().mockImplementation(async ({ data }: any) => ({ id: 'new', ...data, profile: { fullName: data.profile.create.fullName, avatarUrl: null } }));
});
afterAll(() => {
  delete process.env.APPLE_CLIENT_IDS;
});

it('reads the audiences from APPLE_CLIENT_IDS, ignoring blanks', () => {
  expect(appleAudiences({ APPLE_CLIENT_IDS: ' pk.nuray.app, ,pk.nuray.web ' })).toEqual(['pk.nuray.app', 'pk.nuray.web']);
  expect(appleAudiences({})).toEqual([]);
});

it('trusts no token while Sign in with Apple is not configured', async () => {
  delete process.env.APPLE_CLIENT_IDS;
  await expect(signInWithApple('a.b.c')).rejects.toMatchObject({ statusCode: 503, code: 'APPLE_NOT_CONFIGURED' });
  expect(verify).not.toHaveBeenCalled();
});

it('tells each failure apart', async () => {
  const refused = async (reason: ConstructorParameters<typeof AppleIdTokenError>[0]) => {
    verify.mockRejectedValueOnce(new AppleIdTokenError(reason));
    return signInWithApple('a.b.c').catch((e) => ({ status: e.statusCode, code: e.code }));
  };
  expect(await refused('unavailable')).toEqual({ status: 503, code: 'APPLE_UNAVAILABLE' });
  expect(await refused('email_unverified')).toEqual({ status: 401, code: 'APPLE_EMAIL_UNVERIFIED' });
  expect(await refused('no_email')).toEqual({ status: 400, code: 'APPLE_EMAIL_MISSING' });
  expect(await refused('signature')).toEqual({ status: 401, code: 'INVALID_APPLE_TOKEN' });
  expect(await refused('audience')).toEqual({ status: 401, code: 'INVALID_APPLE_TOKEN' });
  expect(db.user.findFirst).not.toHaveBeenCalled();
});

it('makes a customer account named with the name Apple gave at the first sign-in', async () => {
  db.user.findFirst.mockResolvedValue(null);
  const result = await signInWithApple('a.b.c', '  Ayesha Khan ');
  expect(verify).toHaveBeenCalledWith('a.b.c', { audiences: ['pk.nuray.app'] });
  const created = db.user.create.mock.calls[0][0].data;
  expect(created).toMatchObject({ email: identity.email, userType: 'customer', emailVerified: true, profile: { create: { fullName: 'Ayesha Khan' } } });
  expect(result.tokens.access_token).toEqual(expect.any(String));
});

it('signs an existing account in, but never a suspended one or a staff account', async () => {
  db.user.findFirst.mockResolvedValueOnce(existing());
  await expect(signInWithApple('a.b.c')).resolves.toMatchObject({ user: { id: 'u1' } });
  db.user.findFirst.mockResolvedValueOnce(existing({ status: 'suspended' }));
  await expect(signInWithApple('a.b.c')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  db.user.findFirst.mockResolvedValueOnce(existing({ userType: 'admin' }));
  await expect(signInWithApple('a.b.c')).rejects.toMatchObject({ code: 'ADMIN_PASSWORD_ONLY' });
});

it('drops a password set before the address was verified, and every session issued for it', async () => {
  db.user.findFirst.mockResolvedValueOnce(existing({ emailVerified: false, passwordHash: 'set-by-someone' }));
  await signInWithApple('a.b.c');
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({ emailVerified: true, passwordHash: null, tokensValidAfter: expect.any(Date) });
});
