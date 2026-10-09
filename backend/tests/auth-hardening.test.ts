import jwt from 'jsonwebtoken';
import { verifyRefreshToken, verifyToken, isTokenRevoked } from '../src/utils/jwt';
import { isOwnUploadPath, isUploadedBy } from '../src/utils/uploadPaths';

const secret = process.env.JWT_SECRET as string;
const base = { userId: 'u1', userType: 'customer', phone: '+923001234567' };
const legacy = (expiresIn: string) => jwt.sign(base, secret, { expiresIn } as jwt.SignOptions); // no `typ`, like pre-fix tokens

describe('tokens without a typ claim', () => {
  it('are not refresh tokens, however long they live', () => {
    expect(() => verifyRefreshToken(legacy('30d'))).toThrow('Invalid or expired token');
    expect(() => verifyRefreshToken(legacy('24h'))).toThrow('Invalid or expired token');
  });

  it('are not access tokens either', () => {
    expect(() => verifyToken(legacy('24h'))).toThrow('Invalid or expired token');
  });

  it('a refresh token cannot be used as an access token, nor an access token to refresh', () => {
    const access = jwt.sign({ ...base, typ: 'access' }, secret, { expiresIn: '1h' } as jwt.SignOptions);
    const refresh = jwt.sign({ ...base, typ: 'refresh' }, secret, { expiresIn: '30d' } as jwt.SignOptions);
    expect(verifyToken(access).userId).toBe('u1');
    expect(verifyRefreshToken(refresh).userId).toBe('u1');
    expect(() => verifyToken(refresh)).toThrow('Invalid or expired token');
    expect(() => verifyRefreshToken(access)).toThrow('Invalid or expired token');
  });
});

describe('isTokenRevoked to the millisecond', () => {
  it('a token issued a moment before the revocation is void, one issued a moment after is not (same second)', () => {
    const at = new Date(1_700_000_000_500);
    expect(isTokenRevoked({ iat: 1_700_000_000, iatMs: 1_700_000_000_100 }, at)).toBe(true);
    expect(isTokenRevoked({ iat: 1_700_000_000, iatMs: 1_700_000_000_900 }, at)).toBe(false);
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
