/**
 * Changing the password of a signed-in account: the current password is asked for again and counted, the new one
 * must be a good one, every other session ends while this one carries on with fresh tokens, the owner is told, and an
 * account with no password cannot be given one by a token alone. The database is a hand-written double.
 */
import bcrypt from 'bcrypt';

const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { disconnectUser: jest.fn() } }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/jobs/email.jobs', () => ({ queueVerificationEmail: jest.fn(), queuePasswordResetEmail: jest.fn(), queueEmail: jest.fn() }));
jest.mock('../src/services/account-notice.service', () => ({ notifyPasswordChanged: jest.fn(() => Promise.resolve()) }));

import authService from '../src/services/auth.service';
import socketManager from '../src/config/socket';
import { recordAudit } from '../src/middleware/audit';
import { notifyPasswordChanged } from '../src/services/account-notice.service';
import { isTokenRevoked, verifyRefreshToken, verifyToken } from '../src/utils/jwt';

const CURRENT = 'Correct-Horse-1';
const NEXT = 'Cobalt-Meadow-Harbor-26';
let hash: string;

const account = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'aisha@example.com',
  emailVerified: true,
  phone: '+923001234567',
  userType: 'customer',
  status: 'active',
  passwordHash: hash,
  profile: { fullName: 'Aisha Khan' },
  ...over,
});

function givenAccount(over: Record<string, unknown> = {}) {
  db.user = {
    findUnique: jest.fn(async () => account(over)),
    update: jest.fn(async (args: any) => args),
  };
}

beforeAll(async () => {
  hash = await bcrypt.hash(CURRENT, 4);
});

beforeEach(() => {
  (socketManager.disconnectUser as jest.Mock).mockClear();
  (recordAudit as jest.Mock).mockClear();
  (notifyPasswordChanged as jest.Mock).mockClear();
});

describe('changePassword', () => {
  it('sets the new password, ends every older session, and hands this one fresh tokens', async () => {
    givenAccount();
    const before = Date.now();
    const result = await authService.changePassword('u1', CURRENT, NEXT, { ip: '203.0.113.7' });

    const update = db.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'u1' });
    expect(await bcrypt.compare(NEXT, update.data.passwordHash)).toBe(true);
    expect(update.data.tokensValidAfter.getTime()).toBeGreaterThanOrEqual(before);

    // the tokens it hands back are good (not older than the cut-off) and are the right kind; a token from before is void
    const { access_token, refresh_token, expires_in } = result.tokens;
    expect(expires_in).toBeGreaterThan(0);
    expect(isTokenRevoked(verifyToken(access_token), update.data.tokensValidAfter)).toBe(false);
    expect(isTokenRevoked(verifyRefreshToken(refresh_token), update.data.tokensValidAfter)).toBe(false);
    expect(isTokenRevoked({ iat: Math.floor(before / 1000) - 5, iatMs: before - 5000 }, update.data.tokensValidAfter)).toBe(true);

    expect(socketManager.disconnectUser).toHaveBeenCalledWith('u1');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'auth:PASSWORD_CHANGED', ipAddress: '203.0.113.7' }));
  });

  it('tells the owner, through the address the account uses', async () => {
    givenAccount();
    await authService.changePassword('u1', CURRENT, NEXT);
    expect(notifyPasswordChanged).toHaveBeenCalledWith({ email: 'aisha@example.com', emailVerified: true, fullName: 'Aisha Khan' }, expect.any(Date));
  });

  it('refuses a wrong current password with 400 INVALID_PASSWORD and changes nothing', async () => {
    givenAccount({ id: 'u-wrong' });
    await expect(authService.changePassword('u-wrong', 'nope-nope-1', NEXT)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(socketManager.disconnectUser).not.toHaveBeenCalled();
    expect(notifyPasswordChanged).not.toHaveBeenCalled();
  });

  it('counts wrong passwords: five stop even the right one', async () => {
    givenAccount({ id: 'u-guessed' });
    for (let i = 0; i < 5; i++) await expect(authService.changePassword('u-guessed', 'nope-nope-1', NEXT)).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(authService.changePassword('u-guessed', CURRENT, NEXT)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('judges the new password before the old one, so a weak one costs no attempt', async () => {
    givenAccount({ id: 'u-weak' });
    for (let i = 0; i < 8; i++) await expect(authService.changePassword('u-weak', 'nope-nope-1', 'short')).rejects.toMatchObject({ statusCode: 400, code: 'WEAK_PASSWORD', details: { reason: 'TOO_SHORT' } });
    // the eight weak tries were not counted as wrong passwords: the right one still works
    await expect(authService.changePassword('u-weak', CURRENT, NEXT)).resolves.toBeDefined();
  });

  it.each([
    ['a common password', 'password123', 'COMMON'],
    ['one made of the person\'s own name', 'aisha-khan-2026', 'PERSONAL'],
    ['one that is too short', 'Ab1-xyz', 'TOO_SHORT'],
  ])('refuses %s with the reason', async (_label, candidate, reason) => {
    givenAccount({ id: `u-${reason}` });
    await expect(authService.changePassword(`u-${reason}`, CURRENT, candidate)).rejects.toMatchObject({ code: 'WEAK_PASSWORD', details: { reason } });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('asks staff for the longer password', async () => {
    givenAccount({ id: 'u-staff', userType: 'admin' });
    await expect(authService.changePassword('u-staff', CURRENT, 'Cobalt-Mea2')).rejects.toMatchObject({ code: 'WEAK_PASSWORD', details: { reason: 'TOO_SHORT', minLength: 12 } });
  });

  it('refuses the same password again, after the current one has been proven', async () => {
    givenAccount({ id: 'u-same' });
    await expect(authService.changePassword('u-same', CURRENT, CURRENT)).rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_UNCHANGED' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('does not give a password to an account that has none: that goes through "forgot password"', async () => {
    givenAccount({ passwordHash: null });
    await expect(authService.changePassword('u1', 'anything-1', NEXT)).rejects.toMatchObject({ statusCode: 400, code: 'NO_PASSWORD_SET' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('refuses an account that is not there or not active', async () => {
    db.user = { findUnique: jest.fn(async () => null), update: jest.fn() };
    await expect(authService.changePassword('ghost', CURRENT, NEXT)).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
    givenAccount({ status: 'suspended' });
    await expect(authService.changePassword('u1', CURRENT, NEXT)).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
  });
});
