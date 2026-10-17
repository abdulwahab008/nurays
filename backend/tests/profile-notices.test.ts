/**
 * What the profile service says about the account, and who is told when its e-mail address changes: the address the
 * account leaves (when its owner had verified it), never one nobody has proven; and `GET /users/me` tells the owner
 * whether there is a password to change without ever sending the hash. The database is a hand-written double.
 */
import bcrypt from 'bcrypt';

const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/jobs/email.jobs', () => ({ queueVerificationEmail: jest.fn(() => Promise.resolve()), queueEmail: jest.fn() }));
jest.mock('../src/services/account-notice.service', () => ({ notifyEmailChanged: jest.fn(() => Promise.resolve()) }));

import userProfileService from '../src/services/user-profile.service';
import { notifyEmailChanged } from '../src/services/account-notice.service';

let hash: string;
beforeAll(async () => {
  hash = await bcrypt.hash('Correct-Horse-1', 4);
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  phone: '+923001234567',
  phoneVerified: true,
  email: 'old@example.com',
  emailVerified: true,
  passwordHash: hash,
  userType: 'customer',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  profile: { fullName: 'Aisha Khan', avatarUrl: null, city: null, area: null, languagePreference: 'en' },
  ...over,
});

function given(user: Record<string, unknown>, taken: Record<string, unknown> | null = null) {
  const found = row(user);
  db.user = {
    findUnique: jest.fn(async (args: any) => (args.where.email ? taken : found)),
    update: jest.fn(async (args: any) => args),
  };
  db.emailVerification = { deleteMany: jest.fn(), create: jest.fn() };
  db.userProfile = { findUnique: jest.fn(async () => found.profile), update: jest.fn(), create: jest.fn() };
  db.$transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
}

beforeEach(() => (notifyEmailChanged as jest.Mock).mockClear());

describe('getCurrentUserProfile', () => {
  it('says whether the e-mail is verified and whether there is a password, and never sends the hash', async () => {
    given({});
    const mine: any = await userProfileService.getCurrentUserProfile('u1');
    expect(mine).toMatchObject({ email: 'old@example.com', emailVerified: true, hasPassword: true });
    expect(JSON.stringify(mine)).not.toContain(hash);
    expect(mine).not.toHaveProperty('passwordHash');
  });

  it('says there is no password for an account that signs in with Google', async () => {
    given({ passwordHash: null, emailVerified: false });
    expect(await userProfileService.getCurrentUserProfile('u1')).toMatchObject({ emailVerified: false, hasPassword: false });
  });
});

describe('changing the e-mail address', () => {
  it('tells the address the account leaves, with who it was and where it went', async () => {
    given({ id: 'move-1' });
    await userProfileService.updateProfile('move-1', { email: 'New@Example.com', currentPassword: 'Correct-Horse-1' });
    expect(notifyEmailChanged).toHaveBeenCalledTimes(1);
    expect(notifyEmailChanged).toHaveBeenCalledWith({ email: 'old@example.com', emailVerified: true, fullName: 'Aisha Khan' }, 'new@example.com');
  });

  it('hands over what the old address was when the account left it, even if it was not verified (the notice itself decides)', async () => {
    given({ id: 'move-2', emailVerified: false });
    await userProfileService.updateProfile('move-2', { email: 'new@example.com', currentPassword: 'Correct-Horse-1' });
    expect(notifyEmailChanged).toHaveBeenCalledWith(expect.objectContaining({ email: 'old@example.com', emailVerified: false }), 'new@example.com');
  });

  it('tells nobody when the e-mail is not what changed', async () => {
    given({ id: 'move-3' });
    await userProfileService.updateProfile('move-3', { fullName: 'Aisha K' });
    await userProfileService.updateProfile('move-3', { email: 'OLD@example.com' });
    expect(notifyEmailChanged).not.toHaveBeenCalled();
  });

  it('tells nobody when the change is refused: a wrong password, an address that is taken', async () => {
    given({ id: 'move-4' });
    await expect(userProfileService.updateProfile('move-4', { email: 'new@example.com', currentPassword: 'nope-nope-1' })).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    given({ id: 'move-5' }, { id: 'someone-else' });
    await expect(userProfileService.updateProfile('move-5', { email: 'taken@example.com', currentPassword: 'Correct-Horse-1' })).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    expect(notifyEmailChanged).not.toHaveBeenCalled();
  });
});
