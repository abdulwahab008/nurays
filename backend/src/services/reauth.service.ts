import bcrypt from 'bcrypt';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { budgetAdd, budgetReset, budgetUsed } from '../utils/attemptBudget';

/**
 * "Confirm with your password": asked again before something a stolen access token must not be able
 * to do alone, such as pointing the account at another e-mail address or closing it.
 *
 * Only wrong passwords are counted: five in fifteen minutes and the check refuses even the right
 * one until the window ends, so a token that leaks cannot be used to guess the password. A right
 * password clears the count. A wrong one answers 400 INVALID_PASSWORD, not 401: the web app treats
 * a 401 as an expired session and would refresh its tokens and retry.
 */
export const REAUTH_MAX_WRONG = 5;
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;

const key = (userId: string) => `reauth:${userId}`;

export async function assertCurrentPassword(
  user: { id: string; passwordHash: string },
  password: string,
  ctx: { ip?: string | null } = {}
): Promise<void> {
  if ((await budgetUsed(key(user.id))) >= REAUTH_MAX_WRONG) {
    throw new AppError('Too many wrong passwords. Please wait a few minutes and try again.', 429, 'RATE_LIMITED');
  }
  if (await bcrypt.compare(password, user.passwordHash)) {
    await budgetReset(key(user.id));
    return;
  }
  await budgetAdd(key(user.id), REAUTH_WINDOW_MS);
  void recordAudit({ userId: user.id, action: 'auth:REAUTH_FAILED', entityType: 'user', entityId: user.id, ipAddress: ctx.ip ?? null, responseStatus: 400 });
  throw new AppError('Wrong password', 400, 'INVALID_PASSWORD');
}
