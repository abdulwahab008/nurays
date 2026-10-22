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
});
