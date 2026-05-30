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

  it('refresh tokens verify with the same secret and carry the same claims', () => {
    const refresh = generateRefreshToken(payload);
    const decoded = verifyToken(refresh);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.userType).toBe(payload.userType);
  });
});
