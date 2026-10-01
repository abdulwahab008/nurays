import jwt from 'jsonwebtoken';
import { verifyRefreshToken, verifyToken, isTokenRevoked } from '../src/utils/jwt';
import { isOwnUploadPath, isUploadedBy } from '../src/utils/uploadPaths';

const secret = process.env.JWT_SECRET as string;
const base = { userId: 'u1', userType: 'customer', phone: '+923001234567' };
const legacy = (expiresIn: string) => jwt.sign(base, secret, { expiresIn } as jwt.SignOptions); // no `typ`, like pre-fix tokens

describe('legacy (typ-less) tokens', () => {
  it('a legacy long-lived refresh token keeps working as a refresh token (no forced re-login on deploy)', () => {
    expect(verifyRefreshToken(legacy('30d')).userId).toBe('u1');
  });

  it('a legacy short-lived ACCESS token can NOT mint refresh tokens', () => {
    expect(() => verifyRefreshToken(legacy('24h'))).toThrow('Invalid or expired token');
  });

  it('legacy tokens are still accepted as access tokens until they expire', () => {
    expect(verifyToken(legacy('24h')).userId).toBe('u1');
  });
});

describe('isTokenRevoked', () => {
  const now = Math.floor(Date.now() / 1000);

  it('is false when the account has never revoked sessions', () => {
    expect(isTokenRevoked({ iat: now }, null)).toBe(false);
    expect(isTokenRevoked({ iat: now }, undefined)).toBe(false);
  });

  it('voids tokens issued before the revocation, keeps newer ones', () => {
    const revokedAt = new Date((now - 100) * 1000);
    expect(isTokenRevoked({ iat: now - 500 }, revokedAt)).toBe(true);
    expect(isTokenRevoked({ iat: now }, revokedAt)).toBe(false);
  });

  it('treats a token with no issue time as revoked once a revocation exists', () => {
    expect(isTokenRevoked({}, new Date())).toBe(true);
  });
});

describe('upload path checks', () => {
  it('accepts our own upload paths only', () => {
    expect(isOwnUploadPath('/uploads/products/u1_abc.png')).toBe(true);
    expect(isOwnUploadPath('//evil.com/x.png')).toBe(false);
    expect(isOwnUploadPath('https://evil.com/track.png')).toBe(false);
    expect(isOwnUploadPath('/uploads/../etc/passwd')).toBe(false);
    expect(isOwnUploadPath('javascript:alert(1)')).toBe(false);
    expect(isOwnUploadPath('/uploads/' + 'a'.repeat(400))).toBe(false);
  });

  it('recognises a seller\'s own upload by its owner prefix', () => {
    expect(isUploadedBy('/uploads/products/u1_abc.png', 'u1')).toBe(true);
    expect(isUploadedBy('/uploads/products/u2_abc.png', 'u1')).toBe(false);
    expect(isUploadedBy('/uploads/products/1699999-123-biryani.png', 'u1')).toBe(false);
  });
});
