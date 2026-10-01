import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  JWTPayload,
} from '../src/utils/jwt';

const payload: JWTPayload = {
  userId: 'user-123',
  userType: 'customer',
  phone: '+923001234567',
};

describe('jwt utils', () => {
  it('round-trips a signed token back to its payload', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.userType).toBe(payload.userType);
    expect(decoded.phone).toBe(payload.phone);
  });

  it('rejects a tampered token', () => {
    const token = generateToken(payload);
    // Flip the last char of the signature
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(() => verifyToken(tampered)).toThrow('Invalid or expired token');
  });

  it('rejects a garbage token', () => {
    expect(() => verifyToken('not.a.jwt')).toThrow('Invalid or expired token');
  });

  it('decodeToken returns claims without verifying signature', () => {
    const token = generateToken(payload);
    const decoded = decodeToken(token);
    expect(decoded?.userId).toBe(payload.userId);
  });

  it('refresh tokens verify (as refresh tokens) with the same secret and carry the same claims', () => {
    const refresh = generateRefreshToken(payload);
    const decoded = require('../src/utils/jwt').verifyRefreshToken(refresh);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.userType).toBe(payload.userType);
  });
});

describe('jwt token types', () => {
  // verifyRefreshToken is imported lazily so the existing imports above stay as-is.
  const { verifyRefreshToken, tokenTtlSeconds } = require('../src/utils/jwt');

  it('stamps access and refresh tokens with their purpose', () => {
    expect(decodeToken(generateToken(payload))?.typ).toBe('access');
    expect(decodeToken(generateRefreshToken(payload))?.typ).toBe('refresh');
  });

  it('does not accept an access token as a refresh token', () => {
    expect(() => verifyRefreshToken(generateToken(payload))).toThrow('Invalid or expired token');
  });

  it('does not accept a refresh token as an access token', () => {
    expect(() => verifyToken(generateRefreshToken(payload))).toThrow('Invalid or expired token');
  });

  it('accepts a refresh token where a refresh token is required', () => {
    expect(verifyRefreshToken(generateRefreshToken(payload)).userId).toBe(payload.userId);
  });

  it('reports the real access-token lifetime', () => {
    const ttl = tokenTtlSeconds(generateToken(payload));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThan(tokenTtlSeconds(generateRefreshToken(payload)));
  });
});
