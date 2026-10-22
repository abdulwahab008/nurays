const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));

import { secondStepFor, staffTwoFactorRequired } from '../src/services/staff-two-factor.service';
import { verifyChallenge, verifyToken } from '../src/utils/jwt';

describe('when staff are asked for the second step (SEC-3)', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('required by default in production only; the variable decides either way', () => {
    expect(staffTwoFactorRequired({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(staffTwoFactorRequired({ NODE_ENV: 'production', STAFF_2FA_REQUIRED: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(staffTwoFactorRequired({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(staffTwoFactorRequired({ NODE_ENV: 'development', STAFF_2FA_REQUIRED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('someone who set it up is always asked for the code; the token it gives is no API credential', async () => {
    db.staffTwoFactor = { findUnique: jest.fn(async () => ({ enabledAt: new Date() })) };
    process.env.STAFF_2FA_REQUIRED = 'false';
    const step: any = await secondStepFor({ id: 'u1' });
    expect(step.twoFactorRequired).toBe(true);
    expect(verifyChallenge(step.challengeToken, 'mfa').userId).toBe('u1');
    expect(() => verifyChallenge(step.challengeToken, 'mfa-setup')).toThrow();
    expect(() => verifyToken(step.challengeToken)).toThrow();
  });

  it('when required, someone who has not set it up is sent to set it up; when not, signs in as before', async () => {
    db.staffTwoFactor = { findUnique: jest.fn(async () => null) };
    process.env.STAFF_2FA_REQUIRED = 'true';
    const step: any = await secondStepFor({ id: 'u2' });
    expect(step.twoFactorSetupRequired).toBe(true);
    expect(verifyChallenge(step.challengeToken, 'mfa-setup').userId).toBe('u2');
    process.env.STAFF_2FA_REQUIRED = 'false';
    expect(await secondStepFor({ id: 'u2' })).toBeNull();
    // a set-up that was started but never confirmed does not count as on
    db.staffTwoFactor.findUnique = jest.fn(async () => ({ enabledAt: null }));
    expect(await secondStepFor({ id: 'u2' })).toBeNull();
  });

  it('a challenge token stops working when its time is up: 5 minutes for the code, 15 for set-up', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-22T10:00:00Z') });
    try {
      db.staffTwoFactor = { findUnique: jest.fn(async () => ({ enabledAt: new Date() })) };
      const code: any = await secondStepFor({ id: 'u3' });
      db.staffTwoFactor.findUnique = jest.fn(async () => null);
      process.env.STAFF_2FA_REQUIRED = 'true';
      const setup: any = await secondStepFor({ id: 'u3' });
      jest.setSystemTime(new Date('2026-10-22T10:04:50Z'));
      expect(verifyChallenge(code.challengeToken, 'mfa').userId).toBe('u3');
      jest.setSystemTime(new Date('2026-10-22T10:05:10Z'));
      expect(() => verifyChallenge(code.challengeToken, 'mfa')).toThrow();
      expect(verifyChallenge(setup.challengeToken, 'mfa-setup').userId).toBe('u3');
      jest.setSystemTime(new Date('2026-10-22T10:15:10Z'));
      expect(() => verifyChallenge(setup.challengeToken, 'mfa-setup')).toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});

