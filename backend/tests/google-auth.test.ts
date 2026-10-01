/**
 * Google sign-in must only accept a token issued to this app, for a verified
 * email, on an active account — and must not let a pre-registered (unverified)
 * password keep working once Google has proven who owns the email.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}));

import googleAuthService from '../src/services/google-auth.service';
import prisma from '../src/config/database';

const db = prisma as any;
const CLIENT_ID = 'my-app.apps.googleusercontent.com';

function mockGoogle(opts: { aud?: string; verified?: boolean; tokeninfoOk?: boolean } = {}) {
  (global as any).fetch = jest.fn(async (url: string) => {
    if (String(url).includes('tokeninfo')) {
      return { ok: opts.tokeninfoOk ?? true, json: async () => ({ aud: opts.aud ?? CLIENT_ID }) };
    }
    return {
      ok: true,
      json: async () => ({ email: 'Victim@Example.com', verified_email: opts.verified ?? true, name: 'V' }),
    };
  });
}

const existing = (over: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'victim@example.com', phone: '+923001234567', userType: 'customer',
  status: 'active', emailVerified: true, passwordHash: 'hash', profile: null, ...over,
});

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  db.user.findFirst.mockReset();
  db.user.update.mockReset().mockImplementation(async ({ data }: any) => ({ ...existing(), ...data }));
  db.user.create.mockReset();
});
afterAll(() => { delete process.env.GOOGLE_CLIENT_ID; });

describe('authenticateWithGoogle', () => {
  it('rejects a token issued to a different app', async () => {
    mockGoogle({ aud: 'some-other-app' });
    db.user.findFirst.mockResolvedValue(existing());
    await expect(googleAuthService.authenticateWithGoogle('tok')).rejects.toMatchObject({ statusCode: 401 });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects an email Google has not verified', async () => {
    mockGoogle({ verified: false });
    await expect(googleAuthService.authenticateWithGoogle('tok')).rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED' });
  });

  it('refuses a suspended account', async () => {
    mockGoogle();
    db.user.findFirst.mockResolvedValue(existing({ status: 'suspended' }));
    await expect(googleAuthService.authenticateWithGoogle('tok')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('signs in a verified account for this app and does not touch its password', async () => {
    mockGoogle();
    db.user.findFirst.mockResolvedValue(existing());
    const res = await googleAuthService.authenticateWithGoogle('tok');
    expect(res.tokens.access_token).toBeTruthy();
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });

  it('drops the password of a never-verified account once Google proves ownership', async () => {
    mockGoogle();
    db.user.findFirst.mockResolvedValue(existing({ emailVerified: false }));
    await googleAuthService.authenticateWithGoogle('tok');
    expect(db.user.update.mock.calls[0][0].data.passwordHash).toBeNull();
  });

  it('sends the token in a header, not the URL', async () => {
    mockGoogle();
    db.user.findFirst.mockResolvedValue(existing());
    await googleAuthService.authenticateWithGoogle('secret-token');
    const userinfoCall = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).includes('userinfo'));
    expect(String(userinfoCall[0])).not.toContain('secret-token');
    expect(userinfoCall[1].headers.Authorization).toBe('Bearer secret-token');
  });

  it('fails closed in production when no client id is configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
    mockGoogle();
    await expect(googleAuthService.authenticateWithGoogle('tok')).rejects.toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED' });
    (process.env as any).NODE_ENV = prev;
  });
});
