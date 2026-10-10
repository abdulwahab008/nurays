import prisma from '../config/database';
import { isProduction } from '../config/env';
import { generateToken, generateRefreshToken, tokenTtlSeconds, JWTPayload } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { GoogleIdTokenError, verifyGoogleIdToken } from '../utils/google-id-token';

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
        console.error('GOOGLE_CLIENT_ID is not set; refusing Google sign-in');
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

      return await this.signInVerifiedProfile({ email, name, picture });
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
      return await this.signInVerifiedProfile({ email: identity.email, name: identity.name, picture: identity.picture });
    } catch (error) {
      throw mapGoogleError(error);
    }
  }

  /** A person Google has vouched for, with a verified e-mail: sign in the account that has it, or make one. */
  private async signInVerifiedProfile({ email, name, picture }: { email: string; name: string; picture: string | null }) {
    // Check if user exists by email
    let user = await prisma.user.findFirst({
      where: { email },
      include: { profile: true },
    });

    if (user) {
      // A suspended/banned account must not get fresh tokens from a Google login.
      if (user.status !== 'active') {
        throw new AppError('Account is not active', 403, 'ACCOUNT_NOT_ACTIVE');
      }
      if (user.userType === 'admin') {
        throw new AppError('Admin accounts sign in with email and password.', 403, 'ADMIN_PASSWORD_ONLY');
      }
      // User exists, log them in
      // Since they're logging in with Google, their email is verified by Google
      // Update email verification status and last login
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { 
          lastLoginAt: new Date(),
          emailVerified: true, // Google emails are pre-verified
          // If this email was never verified, whoever set its password may have
          // registered it before the real owner (pre-hijack). Google has now
          // proven ownership, so drop that password; the owner signs in via Google.
          // Also void every session already issued for it: the person who set that password (and holds a
          // 30-day refresh token from signup) must not stay logged in to the real owner's account.
          ...(user.emailVerified ? {} : { passwordHash: null, tokensValidAfter: new Date() }),
        },
        include: {
          profile: true,
        },
      });

      // Generate tokens
      const tokenPayload: JWTPayload = {
        userId: updatedUser.id,
        userType: updatedUser.userType,
        phone: updatedUser.phone,
      };

      const accessToken = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      return {
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          email: updatedUser.email,
          userType: updatedUser.userType,
          emailVerified: true, // Always true for Google OAuth
          profile: updatedUser.profile
            ? {
                fullName: updatedUser.profile.fullName,
                avatarUrl: updatedUser.profile.avatarUrl || picture,
                city: updatedUser.profile.city,
                area: updatedUser.profile.area,
              }
            : undefined,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: tokenTtlSeconds(accessToken),
        },
        requiresEmailVerification: false, // Google emails are always verified
      };
    } else {
      // New user, create account
      // Generate temporary phone number
      const emailHash = Buffer.from(email).toString('base64').slice(0, 8);
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.random().toString(36).substring(2, 6);
      const formattedPhone = `+999${emailHash}${timestamp}${random}`;

      // Create user
      user = await prisma.user.create({
        data: {
          email,
          phone: formattedPhone,
          userType: 'customer',
          emailVerified: true, // Google emails are pre-verified
          phoneVerified: false,
          status: 'active',
          profile: {
            create: {
              fullName: name,
              avatarUrl: picture,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      // Generate tokens
      const tokenPayload: JWTPayload = {
        userId: user.id,
        userType: user.userType,
        phone: user.phone,
      };

      const accessToken = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      return {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          userType: user.userType,
          emailVerified: user.emailVerified,
          profile: user.profile
            ? {
                fullName: user.profile.fullName,
                avatarUrl: user.profile.avatarUrl,
                city: user.profile.city,
                area: user.profile.area,
              }
            : undefined,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: tokenTtlSeconds(accessToken),
        },
        requiresEmailVerification: false, // Google emails are pre-verified
      };
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
  console.error('Google authentication error:', error);
  return new AppError('Google authentication failed', 401, 'GOOGLE_AUTH_FAILED');
}

export default new GoogleAuthService();

