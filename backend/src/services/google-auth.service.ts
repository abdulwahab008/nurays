import { isProduction } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { GoogleIdTokenError, verifyGoogleIdToken } from '../utils/google-id-token';
import { logger } from '../utils/logger';
import { signInVerifiedEmail } from './verified-email-sign-in.service';

/** How long a Google call may take before sign-in gives up (Google is normally well under a second). */
const GOOGLE_TIMEOUT_MS = 10_000;

export class GoogleAuthService {
  /**
   * Authenticate user with Google OAuth token
   * Creates new user if doesn't exist, otherwise logs in
   */
  async authenticateWithGoogle(accessToken: string) {
    try {
      // 1. The token must have been issued to THIS app. userinfo alone answers for
      // any valid Google access token, including one a victim granted to some
      // unrelated third-party app, which that app could replay here to sign in
      // as the victim. tokeninfo reports the client it was issued to.
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (!expectedClientId && isProduction()) {
        logger.error('GOOGLE_CLIENT_ID is not set; refusing Google sign-in');
        throw new AppError('Google sign-in is not configured', 503, 'GOOGLE_NOT_CONFIGURED');
      }
      if (expectedClientId) {
        const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ access_token: accessToken }),
          signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        });
        if (!infoRes.ok) {
          throw new AppError('Invalid Google access token', 401, 'INVALID_GOOGLE_TOKEN');
        }
        const info = (await infoRes.json()) as { aud?: string; azp?: string };
        if (info.aud !== expectedClientId && info.azp !== expectedClientId) {
          throw new AppError('Google token was not issued for this app', 401, 'INVALID_GOOGLE_TOKEN');
        }
      }

      // 2. Get user info from Google using the access token (header, not URL,
      // so the token doesn't end up in proxy/access logs).
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new AppError('Invalid Google access token', 401, 'INVALID_GOOGLE_TOKEN');
      }

      const payload = await response.json() as {
        email?: string;
        verified_email?: boolean;
        name?: string;
        picture?: string;
        id?: string;
      };

      // 3. Only an email Google has verified can claim (or create) an account.
      if (payload.verified_email !== true) {
        throw new AppError('Your Google email is not verified', 401, 'GOOGLE_EMAIL_UNVERIFIED');
      }

      const email = payload.email?.toLowerCase().trim();
      const name = payload.name || '';
      const picture = payload.picture || null;

      if (!email) {
        throw new AppError('Email not provided by Google', 400, 'GOOGLE_EMAIL_MISSING');
      }

      return await signInVerifiedEmail({ email, name, picture });
    } catch (error) {
      throw mapGoogleError(error);
    }
  }

  /**
   * Authenticate a user with a Google ID token, which is what a native app's Google sign-in produces.
   * The token's signature, issuer, audience, expiry and e-mail verification are checked against Google's
   * published keys (see utils/google-id-token.ts) before anything else happens; from there it is the same
   * sign-in as with an access token.
   */
  async authenticateWithGoogleIdToken(idToken: string) {
    try {
      const audiences = googleAudiences();
      if (audiences.length === 0) {
        // Unlike the access-token path there is no development shortcut: an ID token is only worth trusting for an audience we know.
        throw new AppError('Google sign-in is not configured', 503, 'GOOGLE_NOT_CONFIGURED');
      }
      let identity;
      try {
        identity = await verifyGoogleIdToken(idToken, { audiences });
      } catch (err) {
        if (!(err instanceof GoogleIdTokenError)) throw err;
        if (err.reason === 'unavailable') throw new AppError('Google sign-in is temporarily unavailable', 503, 'GOOGLE_UNAVAILABLE');
        if (err.reason === 'email_unverified') throw new AppError('Your Google email is not verified', 401, 'GOOGLE_EMAIL_UNVERIFIED');
        if (err.reason === 'no_email') throw new AppError('Email not provided by Google', 400, 'GOOGLE_EMAIL_MISSING');
        throw new AppError('Invalid Google ID token', 401, 'INVALID_GOOGLE_TOKEN');
      }
      return await signInVerifiedEmail({ email: identity.email, name: identity.name, picture: identity.picture });
    } catch (error) {
      throw mapGoogleError(error);
    }
  }
}

/** The client ids a Google token may have been issued to: the web client, and any native clients. */
function googleAudiences(): string[] {
  return [process.env.GOOGLE_CLIENT_ID, ...(process.env.GOOGLE_NATIVE_CLIENT_IDS ?? '').split(',')].map((id) => (id ?? '').trim()).filter(Boolean);
}

/** What a failure while signing in with Google means to the person: our own errors as they are, a slow Google as "unavailable", the rest as a failed sign-in. */
function mapGoogleError(error: unknown): Error {
  if (error instanceof AppError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new AppError('Google sign-in is temporarily unavailable', 503, 'GOOGLE_UNAVAILABLE');
  }
  logger.error({ err: error }, 'Google authentication error');
  return new AppError('Google authentication failed', 401, 'GOOGLE_AUTH_FAILED');
}

export default new GoogleAuthService();

