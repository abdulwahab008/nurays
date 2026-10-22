import { base32Decode, base32Encode, hashBackupCode, hotp, newBackupCodes, newTotpSecret, openSecret, otpauthUrl, sealSecret, stepAt, verifyTotp } from '../src/utils/totp';

describe('one-time codes (RFC 6238)', () => {
  // The RFC's own test secret and vectors (SHA-1, eight digits); six digits are the last six.
  const rfcSecret = Buffer.from('12345678901234567890');
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('at %i s the code is %s', (t, code) => {
    expect(hotp(rfcSecret, stepAt(t * 1000), 8)).toBe(code);
    expect(hotp(rfcSecret, stepAt(t * 1000))).toBe(code.slice(-6));
  });

  it('base32 round-trips, and a new secret is 160 bits', () => {
    expect(base32Encode(rfcSecret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(rfcSecret);
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
  });

  it('accepts the code for now and one step either side, once', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1234567890 * 1000;
    const code = hotp(rfcSecret, stepAt(now));
    expect(verifyTotp(secret, code, now)).toBe(stepAt(now));
    expect(verifyTotp(secret, hotp(rfcSecret, stepAt(now) - 1), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(secret, hotp(rfcSecret, stepAt(now) + 1), now)).toBe(stepAt(now) + 1);
    expect(verifyTotp(secret, hotp(rfcSecret, stepAt(now) - 2), now)).toBeNull();
    // used once: the same step (or an older one) is not accepted again
    expect(verifyTotp(secret, code, now, stepAt(now))).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('builds the link an authenticator app opens', () => {
    expect(otpauthUrl('ABC', 'admin@nuray.pk')).toBe('otpauth://totp/Nuray%3Aadmin%40nuray.pk?secret=ABC&issuer=Nuray&algorithm=SHA1&digits=6&period=30');
  });

  it('backup codes are distinct, and their hash ignores case, spaces and the dash', () => {
    const codes = newBackupCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashBackupCode('K7M2-9XQA')).toBe(hashBackupCode(' k7m2 9xqa '));
  });

  it('the secret is sealed at rest and opens again; a tampered one does not', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-test-secret-0123456789abcdef0123456789';
    const sealed = sealSecret('GEZDGNBVGY3TQOJQ');
    expect(sealed).not.toContain('GEZDGNBVGY3TQOJQ');
    expect(openSecret(sealed)).toBe('GEZDGNBVGY3TQOJQ');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('AAAA').toString('base64');
    expect(() => openSecret(parts.join('.'))).toThrow();
  });
});
