/**
 * "Confirm with your password": only wrong passwords count, five in fifteen minutes stop even the
 * right one, a right one clears the count, and a wrong one is a 400 (a 401 would make the web app
 * refresh its session and try again).
 */
import bcrypt from 'bcrypt';

jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));

import { assertCurrentPassword, REAUTH_MAX_WRONG } from '../src/services/reauth.service';
import { recordAudit } from '../src/middleware/audit';

let hash: string;
beforeAll(async () => {
  hash = await bcrypt.hash('Correct-Horse-1', 4);
});

const user = (id: string) => ({ id, passwordHash: hash });
const wrong = (id: string, ip?: string) => assertCurrentPassword(user(id), 'nope', { ip });

describe('assertCurrentPassword', () => {
  it('accepts the right password', async () => {
    await expect(assertCurrentPassword(user('re-ok'), 'Correct-Horse-1')).resolves.toBeUndefined();
  });

  it('answers a wrong password with 400 INVALID_PASSWORD and leaves a trail with the address', async () => {
    await expect(wrong('re-wrong', '203.0.113.9')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: 're-wrong', action: 'auth:REAUTH_FAILED', ipAddress: '203.0.113.9' }));
  });

  it('refuses everything, even the right password, after five wrong ones', async () => {
    expect(REAUTH_MAX_WRONG).toBe(5);
    for (let i = 0; i < 5; i++) await expect(wrong('re-locked')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(assertCurrentPassword(user('re-locked'), 'Correct-Horse-1')).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    await expect(wrong('re-locked')).rejects.toMatchObject({ statusCode: 429 });
  });

  it('does not write an audit row for a refusal it did not even check', async () => {
    for (let i = 0; i < 5; i++) await wrong('re-quiet').catch(() => undefined);
    (recordAudit as jest.Mock).mockClear();
    await wrong('re-quiet').catch(() => undefined);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('forgets earlier mistakes after a right password', async () => {
    for (let i = 0; i < 4; i++) await wrong('re-clear').catch(() => undefined);
    await assertCurrentPassword(user('re-clear'), 'Correct-Horse-1');
    for (let i = 0; i < 4; i++) await expect(wrong('re-clear')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(assertCurrentPassword(user('re-clear'), 'Correct-Horse-1')).resolves.toBeUndefined();
  });

  it("counts each account on its own", async () => {
    for (let i = 0; i < 5; i++) await wrong('re-a').catch(() => undefined);
    await expect(assertCurrentPassword(user('re-b'), 'Correct-Horse-1')).resolves.toBeUndefined();
  });
});
