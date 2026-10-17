/**
 * Signing in with a Google ID token (a native app's Google sign-in): the token is checked by utils/google-id-token
 * (tested on its own); what is tested here is what the service does with the answer: which client ids it asks for,
 * how each way the check can fail is told to the person, and that a verified identity signs in exactly as with an
 * access token (an active account only, never an admin, a new customer account when there is none).
 */
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../src/utils/google-id-token', () => {
  const actual = jest.requireActual('../src/utils/google-id-token');
  return { ...actual, verifyGoogleIdToken: jest.fn() };
});

import googleAuthService from '../src/services/google-auth.service';
import { logger } from '../src/utils/logger';
import prisma from '../src/config/database';
import { GoogleIdTokenError, verifyGoogleIdToken } from '../src/utils/google-id-token';

const db = prisma as any;
const verify = verifyGoogleIdToken as jest.Mock;

const identity = { subject: '1', email: 'rider@example.com', name: 'Rana Rider', picture: 'https://lh3.example/p.jpg' };
const existing = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'rider@example.com', phone: '+923001234567', userType: 'customer',
  status: 'active', emailVerified: true, passwordHash: 'hash', profile: null, ...over,
});

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com';
  delete process.env.GOOGLE_NATIVE_CLIENT_IDS;
  verify.mockReset().mockResolvedValue(identity);
  db.user.findFirst.mockReset();
  db.user.update.mockReset().mockImplementation(async ({ data }: any) => ({ ...existing(), ...data }));
  db.user.create.mockReset().mockImplementation(async ({ data }: any) => ({ id: 'new', ...data, profile: { fullName: data.profile.create.fullName, avatarUrl: data.profile.create.avatarUrl } }));
});
afterAll(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_NATIVE_CLIENT_IDS;
});

describe('authenticateWithGoogleIdToken', () => {
  it('asks the verifier for the web client and every native client, ignoring blanks', async () => {
    process.env.GOOGLE_NATIVE_CLIENT_IDS = ' android.apps.googleusercontent.com, ,ios.apps.googleusercontent.com ';
    db.user.findFirst.mockResolvedValue(existing());
    await googleAuthService.authenticateWithGoogleIdToken('a.b.c-token');
    expect(verify).toHaveBeenCalledWith('a.b.c-token', { audiences: ['web.apps.googleusercontent.com', 'android.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'] });
  });

  it('never trusts a token when no client id is configured, even in development', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok')).rejects.toMatchObject({ statusCode: 503, code: 'GOOGLE_NOT_CONFIGURED' });
    expect(verify).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('signs in the active account that has the verified e-mail', async () => {
    db.user.findFirst.mockResolvedValue(existing());
    const result = await googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok');
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'rider@example.com' } }));
    expect(result.user).toMatchObject({ id: 'u1', userType: 'customer', emailVerified: true });
    expect(result.tokens.access_token).toBeTruthy();
    expect(result.tokens.refresh_token).toBeTruthy();
    expect(result.requiresEmailVerification).toBe(false);
    // an account whose e-mail was already verified keeps its password
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });

  it('drops the password of an account whose e-mail was never verified, as the access-token sign-in does', async () => {
    db.user.findFirst.mockResolvedValue(existing({ emailVerified: false }));
    await googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok');
    expect(db.user.update.mock.calls[0][0].data).toMatchObject({ passwordHash: null });
    expect(db.user.update.mock.calls[0][0].data.tokensValidAfter).toBeInstanceOf(Date);
  });

  it('makes a customer account for a person who has none', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const result = await googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok');
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({ email: 'rider@example.com', userType: 'customer', emailVerified: true, status: 'active' });
    expect(result.user.userType).toBe('customer');
  });

  it('refuses a suspended account and an admin account', async () => {
    db.user.findFirst.mockResolvedValue(existing({ status: 'suspended' }));
    await expect(googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok')).rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_NOT_ACTIVE' });
    db.user.findFirst.mockResolvedValue(existing({ userType: 'admin' }));
    await expect(googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok')).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_PASSWORD_ONLY' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('tells the person why a token was refused, and a Google that cannot be reached apart from a bad token', async () => {
    const refused = async (reason: ConstructorParameters<typeof GoogleIdTokenError>[0]) => {
      verify.mockRejectedValueOnce(new GoogleIdTokenError(reason));
      return googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok').catch((e) => ({ status: e.statusCode, code: e.code }));
    };
    expect(await refused('unavailable')).toEqual({ status: 503, code: 'GOOGLE_UNAVAILABLE' });
    expect(await refused('email_unverified')).toEqual({ status: 401, code: 'GOOGLE_EMAIL_UNVERIFIED' });
    expect(await refused('no_email')).toEqual({ status: 400, code: 'GOOGLE_EMAIL_MISSING' });
    for (const reason of ['malformed', 'algorithm', 'unknown_key', 'signature', 'issuer', 'audience', 'expired', 'no_subject'] as const) {
      expect(await refused(reason)).toEqual({ status: 401, code: 'INVALID_GOOGLE_TOKEN' });
    }
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('answers a failure of its own as a failed sign-in, not with a stack trace', async () => {
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    verify.mockRejectedValueOnce(new Error('boom'));
    await expect(googleAuthService.authenticateWithGoogleIdToken('tok-tok-tok')).rejects.toMatchObject({ statusCode: 401, code: 'GOOGLE_AUTH_FAILED' });
  });
});
