import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId: string;
  userType: string;
  phone: string;
  /** Token purpose. Access and refresh tokens share a secret, so this keeps one from standing in for the other. */
  typ?: 'access' | 'refresh';
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign({ ...payload, typ: 'access' }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign({ ...payload, typ: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
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
    throw new Error('Invalid or expired token');
  }
  if (decoded.typ === 'refresh') {
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
    throw new Error('Invalid or expired token');
  }
  if (decoded.typ !== 'refresh') {
    throw new Error('Invalid or expired token');
  }
  return decoded;
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

