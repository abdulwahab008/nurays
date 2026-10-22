import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const JWT_SECRET = process.env.JWT_SECRET;
// Short-lived: the client renews it with the refresh token, so a copied access token is useful for an hour, not a day.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId: string;
  userType: string;
  phone: string;
  /** Token purpose. Access and refresh tokens share a secret, so this keeps one from standing in for the other. */
  typ?: 'access' | 'refresh';
  /** The session (one device's sign-in) the token belongs to; see services/session.service.ts. */
  sid?: string;
  /** A refresh token's own id, recorded in refresh_tokens. */
  jti?: string;
  /** Issue time in milliseconds: revocation is exact to the millisecond, not the second. */
  iatMs?: number;
  /** Issued-at / expiry (seconds), added by jsonwebtoken. */
  iat?: number;
  exp?: number;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign({ ...payload, typ: 'access', iatMs: Date.now() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign({ ...payload, typ: 'refresh', iatMs: Date.now() }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
};

/**
 * A staff member's password was right and the second step is next (SEC-3): this short-lived token says so and
 * nothing more. It is no API credential (verifyToken wants typ 'access') and cannot be refreshed.
 *  - mfa:       enter the code from the authenticator app (or a backup code)
 *  - mfa-setup: set the authenticator app up first
 */
export type ChallengePurpose = 'mfa' | 'mfa-setup';
const CHALLENGE_TTL: Record<ChallengePurpose, string> = { mfa: '5m', 'mfa-setup': '15m' };

export const signChallenge = (userId: string, purpose: ChallengePurpose): string =>
  jwt.sign({ userId, typ: purpose, iatMs: Date.now() }, JWT_SECRET, { expiresIn: CHALLENGE_TTL[purpose] } as jwt.SignOptions);

/** The user a challenge token is for, or an error when it is not a live token of that purpose. */
export const verifyChallenge = (token: string, purpose: ChallengePurpose): { userId: string; iatMs?: number } => {
  let decoded: { userId?: string; typ?: string; iatMs?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
  } catch (error) {
    throw new Error('Invalid or expired token', { cause: error });
  }
  if (decoded.typ !== purpose || !decoded.userId) throw new Error('Invalid or expired token');
  return { userId: decoded.userId, iatMs: decoded.iatMs };
};

/** When a token expires, from its own `exp` claim. */
export const tokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000);
};

/**
 * Verify an access token. A refresh token is rejected here, so a stolen
 * long-lived refresh token can't be used as an API credential. (Tokens issued
 * before `typ` existed carry none and are still accepted until they expire.)
 */
export const verifyToken = (token: string): JWTPayload => {
  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token', { cause: error });
  }
  if (decoded.typ !== 'access') {
    throw new Error('Invalid or expired token');
  }
  return decoded;
};

/**
 * Verify a refresh token. Only a token minted as a refresh token qualifies — an
 * access token must not be able to mint new 30-day refresh tokens.
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  let decoded: JWTPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token', { cause: error });
  }
  if (decoded.typ === 'refresh') return decoded;
  // A token that does not say it is a refresh token is not one (every token issued since the
  // `typ` claim was introduced carries it; nothing older is still valid).
  throw new Error('Invalid or expired token');
};

/**
 * Has this session been revoked? `tokensValidAfter` is set when the account's credentials or
 * ownership change (password reset, takeover of an unverified account, phone eviction): every
 * token issued before it stops working, access and refresh alike.
 */
export const isTokenRevoked = (payload: { iat?: number; iatMs?: number }, tokensValidAfter?: Date | null): boolean => {
  if (!tokensValidAfter) return false;
  // Newer tokens carry their issue time to the millisecond, so a session started a moment before the
  // revocation is voided and one started a moment after is not.
  if (typeof payload.iatMs === 'number') return payload.iatMs < tokensValidAfter.getTime();
  if (!payload.iat) return true; // can't prove it's newer
  return payload.iat < Math.floor(tokensValidAfter.getTime() / 1000);
};

/** Lifetime of a freshly issued token in seconds, so `expires_in` reports the real value. */
export const tokenTtlSeconds = (token: string): number => {
  const decoded = jwt.decode(token) as { iat?: number; exp?: number } | null;
  return decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 3600;
};

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
};

