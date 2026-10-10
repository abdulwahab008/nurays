import { AppError } from '../middleware/errorHandler';
import { checkPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type PasswordContext, type PasswordProblem } from './password-rules';

export { checkPassword, MIN_PASSWORD_LENGTH, MIN_STAFF_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './password-rules';
export type { PasswordContext, PasswordProblem } from './password-rules';

const MESSAGES: Record<PasswordProblem, (min: number) => string> = {
  TOO_SHORT: (min) => `Use a password of at least ${min} characters.`,
  TOO_LONG: () => `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`,
  COMMON: () => 'That password is too common and easy to guess. Choose something harder.',
  PERSONAL: () => 'Do not use your name, phone number, e-mail or "Nuray" in your password.',
};

/** Throws 400 WEAK_PASSWORD, with the reason in `details.reason` so a screen can say it in the user's language. */
export function assertPasswordStrength(password: unknown, ctx: PasswordContext = {}): asserts password is string {
  const min = ctx.minLength ?? MIN_PASSWORD_LENGTH;
  const problem = typeof password === 'string' ? checkPassword(password, ctx) : 'TOO_SHORT';
  if (problem) throw new AppError(MESSAGES[problem](min), 400, 'WEAK_PASSWORD', { reason: problem, minLength: min });
}
