/**
 * An administrator account is locked after five wrong passwords. The wrong ones used to be counted from audit rows that
 * are only written after a password has been checked, so a burst of simultaneous guesses all read the same count and
 * every one of them was checked. Now each attempt is counted before its password is looked at.
 */
import bcrypt from 'bcrypt';

const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { disconnectUser: jest.fn() } }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/jobs/email.jobs', () => ({ queueVerificationEmail: jest.fn(), queuePasswordResetEmail: jest.fn(), queueEmail: jest.fn() }));

import authService from '../src/services/auth.service';
import { recordAudit } from '../src/middleware/audit';
import { budgetReset } from '../src/utils/attemptBudget';

const RIGHT = 'Cobalt-Meadow-Harbor-26';
let hash: string;

const admin = (id: string) => ({
  id,
  email: `${id}@nuray.test`,
  emailVerified: true,
  phone: '+923001234567',
  userType: 'admin',
  staffRole: 'admin',
  status: 'active',
  passwordHash: hash,
  profile: { fullName: 'Admin' },
});

function givenAdmin(id: string, { failuresInAuditLog = 0 } = {}) {
  db.user = { findFirst: jest.fn(async () => admin(id)), update: jest.fn(async () => ({})) };
  db.auditLog = { findFirst: jest.fn(async () => null), count: jest.fn(async () => failuresInAuditLog) };
}

const login = (id: string, password: string) => authService.login(`${id}@nuray.test`, password, 'email');
const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as { code: string }).code);

beforeAll(async () => {
  hash = await bcrypt.hash(RIGHT, 4);
});
beforeEach(() => jest.clearAllMocks());

describe('admin sign-in under a burst of guesses', () => {
  it('checks at most five passwords out of forty simultaneous wrong ones, and locks the rest out', async () => {
    givenAdmin('burst');
    const compare = jest.spyOn(bcrypt, 'compare');
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => outcome(login('burst', `wrong-guess-${i}`))));
    expect(results.filter((r) => r === 'INVALID_CREDENTIALS')).toHaveLength(5);
    expect(results.filter((r) => r === 'ACCOUNT_LOCKED')).toHaveLength(35);
    expect(compare).toHaveBeenCalledTimes(5);
    compare.mockRestore();
  });

  it('refuses even the right password once five wrong ones are used up', async () => {
    givenAdmin('locked');
    for (let i = 0; i < 5; i++) expect(await outcome(login('locked', `nope-${i}`))).toBe('INVALID_CREDENTIALS');
    expect(await outcome(login('locked', RIGHT))).toBe('ACCOUNT_LOCKED');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth:LOGIN_LOCKED', entityId: 'locked' }));
  });

  it('lets the right password in after four wrong ones, and forgets the mistakes', async () => {
    givenAdmin('forgives');
    for (let i = 0; i < 4; i++) expect(await outcome(login('forgives', `nope-${i}`))).toBe('INVALID_CREDENTIALS');
    expect(await outcome(login('forgives', RIGHT))).toBe('ok');
    for (let i = 0; i < 4; i++) expect(await outcome(login('forgives', `again-${i}`))).toBe('INVALID_CREDENTIALS');
    expect(await outcome(login('forgives', RIGHT))).toBe('ok');
  });

  it('still honours failures the audit log already holds (another instance, an earlier hour)', async () => {
    givenAdmin('audited', { failuresInAuditLog: 5 });
    expect(await outcome(login('audited', RIGHT))).toBe('ACCOUNT_LOCKED');
  });

  it('counts each account on its own, and does not count an ordinary customer at all', async () => {
    givenAdmin('first');
    for (let i = 0; i < 5; i++) await outcome(login('first', `nope-${i}`));
    givenAdmin('second');
    expect(await outcome(login('second', RIGHT))).toBe('ok');
    db.user = { findFirst: jest.fn(async () => ({ ...admin('customer1'), userType: 'customer', staffRole: null })), update: jest.fn(async () => ({})) };
    db.auditLog = { findFirst: jest.fn(), count: jest.fn() };
    for (let i = 0; i < 8; i++) expect(await outcome(login('customer1', `nope-${i}`))).toBe('INVALID_CREDENTIALS');
    expect(db.auditLog.count).not.toHaveBeenCalled();
  });
});

afterAll(async () => {
  for (const id of ['burst', 'locked', 'forgives', 'audited', 'first', 'second']) await budgetReset(`admin-login:${id}`);
});
