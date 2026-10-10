import { createHash } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { budgetAdd } from './attemptBudget';

/**
 * How many verification e-mails one inbox may be sent in an hour, whoever asks for them. Without
 * it a sign-up or an "change my e-mail" screen is a way to fill someone else's inbox, and the
 * sender's reputation with the mail provider suffers.
 */
export const VERIFY_MAILS_PER_ADDRESS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The inbox an address delivers to: "a.b+tag@gmail.com" and "ab@gmail.com" are one inbox, so adding a
 * tag or dots does not make a new address. Hashed, because the counter store should not hold addresses.
 */
export function mailboxKey(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  const domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain;
  let local = rawLocal.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return createHash('sha256').update(`${local}@${domain}`).digest('hex').slice(0, 32);
}

/** Throws 429 once this inbox has been sent its share of verification e-mails this hour. */
export async function assertVerifyMailAllowed(email: string): Promise<void> {
  const count = await budgetAdd(`mail:verify:${mailboxKey(email)}`, HOUR_MS);
  if (count > VERIFY_MAILS_PER_ADDRESS_PER_HOUR) {
    throw new AppError('Too many verification e-mails have been sent to this address. Please try again in an hour.', 429, 'RATE_LIMITED');
  }
}
