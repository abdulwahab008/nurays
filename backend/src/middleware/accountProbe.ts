import type { Request } from 'express';
import { isProduction } from '../config/env';
import { AppError } from './errorHandler';
import { budgetAdd, budgetUsed } from '../utils/attemptBudget';

/**
 * Sign-up and the code request say plainly when an account already exists (SEC-11: what people expect from a food
 * app, and what saves duplicate accounts and support tickets). The risk is someone running a list of numbers or
 * e-mails through them to learn who has an account, so those answers are counted per network address: after
 * ACCOUNT_PROBE_LIMIT in an hour, that address gets 429 for the rest of the hour. A real person meets this
 * answer once or twice.
 */
export const ACCOUNT_EXISTS_CODES = ['EMAIL_EXISTS', 'PHONE_EXISTS', 'USER_EXISTS', 'PASSWORD_NOT_SET'];
export const ACCOUNT_PROBE_WINDOW_MS = 60 * 60 * 1000;
export const accountProbeLimit = () => (isProduction() ? 5 : 10_000);

const keyFor = (req: Pick<Request, 'ip'>) => `account-probe:${req.ip ?? 'unknown'}`;

/**
 * Run a sign-up step that may answer "this account exists". Refused up front once the address has had its share of
 * such answers; counts one more when it gets one.
 */
export async function guardAccountProbe<T>(req: Pick<Request, 'ip'>, step: () => Promise<T>, limit = accountProbeLimit()): Promise<T> {
  const key = keyFor(req);
  if ((await budgetUsed(key)) >= limit) {
    throw new AppError('Too many attempts from this network. Please try again in an hour.', 429, 'RATE_LIMITED');
  }
  try {
    return await step();
  } catch (err) {
    if (err instanceof AppError && ACCOUNT_EXISTS_CODES.includes(err.code)) await budgetAdd(key, ACCOUNT_PROBE_WINDOW_MS);
    throw err;
  }
}
