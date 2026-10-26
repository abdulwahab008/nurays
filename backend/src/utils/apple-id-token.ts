/**
 * Verifying an Apple identity token, which is what Sign in with Apple hands the app. The checks are
 * utils/id-token.ts's; Apple publishes its keys at https://appleid.apple.com/auth/keys. Apple's tokens carry no name
 * (the app gets it once, at the first sign-in, and sends it along), and the e-mail may be a private relay address
 * (@privaterelay.appleid.com), which is the person's real, verified address for this app.
 */
import { createIdTokenVerifier, type VerifiedIdentity, type VerifyOptions } from './id-token';

export { IdTokenError as AppleIdTokenError } from './id-token';

const apple = createIdTokenVerifier({
  certsUrl: 'https://appleid.apple.com/auth/keys',
  issuers: ['https://appleid.apple.com'],
});

/** Check an Apple identity token and say who it is for. Throws `AppleIdTokenError` with the reason when it should not be trusted. */
export const verifyAppleIdToken = (identityToken: string, options: VerifyOptions): Promise<VerifiedIdentity> => apple.verify(identityToken, options);

/** Forget the cached keys (tests, and nothing else). */
export const resetAppleKeyCache = (): void => apple.reset();
