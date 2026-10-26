/**
 * Sign in with Apple (required on iOS because the app offers Google sign-in: App Store guideline 4.8). The app hands
 * over Apple's identity token; once utils/apple-id-token.ts has checked it, the account with that verified e-mail
 * signs in or a customer account is made, by the same rules as Google (verified-email-sign-in.service.ts).
 *
 * The token's audience must be one of APPLE_CLIENT_IDS: the app's bundle id (pk.nuray.app), and a Services ID if the
 * website ever offers the button too.
 */
import { AppError } from '../middleware/errorHandler';
import { AppleIdTokenError, verifyAppleIdToken } from '../utils/apple-id-token';
import { logger } from '../utils/logger';
import { signInVerifiedEmail } from './verified-email-sign-in.service';

export const appleAudiences = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.APPLE_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);

/**
 * `fullName` is what Apple gave the app at the person's first sign-in (Apple never repeats it, and never puts it in
 * the token); it names a new account and is ignored for an existing one.
 */
export async function signInWithApple(identityToken: string, fullName?: string) {
  const audiences = appleAudiences();
  if (audiences.length === 0) throw new AppError('Sign in with Apple is not configured', 503, 'APPLE_NOT_CONFIGURED');
  let identity;
  try {
    identity = await verifyAppleIdToken(identityToken, { audiences });
  } catch (err) {
    if (!(err instanceof AppleIdTokenError)) {
      logger.error({ err }, 'Apple sign-in error');
      throw new AppError('Sign in with Apple failed', 500, 'APPLE_AUTH_FAILED');
    }
    if (err.reason === 'unavailable') throw new AppError('Sign in with Apple is temporarily unavailable', 503, 'APPLE_UNAVAILABLE');
    if (err.reason === 'email_unverified') throw new AppError('Your Apple ID e-mail is not verified', 401, 'APPLE_EMAIL_UNVERIFIED');
    if (err.reason === 'no_email') {
      throw new AppError('Apple did not share an e-mail address. Allow it (or "Hide My Email") and try again.', 400, 'APPLE_EMAIL_MISSING');
    }
    throw new AppError('Invalid Apple sign-in', 401, 'INVALID_APPLE_TOKEN');
  }
  return signInVerifiedEmail({ email: identity.email, name: fullName?.trim() || identity.name, picture: null });
}
