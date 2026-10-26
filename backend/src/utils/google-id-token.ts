/**
 * Verifying a Google ID token, which is what a native app's Google sign-in hands over instead of the access token the
 * web button sends. The checks are utils/id-token.ts's; Google publishes its keys at
 * https://www.googleapis.com/oauth2/v3/certs.
 */
import { createIdTokenVerifier, IdTokenError, type IdTokenFailure, type VerifiedIdentity, type VerifyOptions } from './id-token';

export { IdTokenError as GoogleIdTokenError };
export type GoogleIdTokenFailure = IdTokenFailure;
export type GoogleIdentity = VerifiedIdentity;
export type { VerifyOptions };

const google = createIdTokenVerifier({
  certsUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
});

/** Check a Google ID token and say who it is for. Throws `GoogleIdTokenError` with the reason when it should not be trusted. */
export const verifyGoogleIdToken = (idToken: string, options: VerifyOptions): Promise<GoogleIdentity> => google.verify(idToken, options);

/** Forget the cached keys (tests, and nothing else). */
export const resetGoogleKeyCache = (): void => google.reset();
