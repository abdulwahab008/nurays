/**
 * A new password has to be long enough, not one of the most common, and not built from the owner's own
 * name, phone or e-mail. It is checked when a password is chosen, never at sign-in.
 */
import { assertPasswordStrength, checkPassword, MIN_STAFF_PASSWORD_LENGTH } from '../src/utils/password-policy';

describe('checkPassword', () => {
  it('accepts a long, unusual password', () => {
    expect(checkPassword('purple-giraffe-42')).toBeNull();
    expect(checkPassword('Mango!Lassi!On!Sunday')).toBeNull();
  });

  it('counts length as a person does: by character, not by byte', () => {
    expect(checkPassword('1234567')).toBe('TOO_SHORT');
    expect(checkPassword('🍛🍛🍛🍛🍛🍛🍛')).toBe('TOO_SHORT'); // seven characters
    expect(checkPassword('🍛🍚🍜🍲🥘🥗🍋🌶️')).toBeNull(); // eight or more
    expect(checkPassword('نیا-پاس-ورڈ-۱۲۳')).toBeNull();
  });

  it('allows up to 200 characters and no more', () => {
    expect(checkPassword('a1-' + 'x'.repeat(197))).toBeNull();
    expect(checkPassword('a1-' + 'x'.repeat(198))).toBe('TOO_LONG');
  });

  it('refuses common passwords whatever the capitals, and the common word with a tail', () => {
    for (const weak of ['password', 'PASSWORD', 'Qwertyuiop', 'iloveyou', '12345678', 'Password123!', 'monkey123', 'Pakistan123', 'bismillah']) {
      expect(checkPassword(weak)).toBe('COMMON');
    }
  });

  it('does not refuse a word just because it is a word', () => {
    expect(checkPassword('Summer-Blossom!')).toBeNull();
    expect(checkPassword('correct horse battery staple')).toBeNull();
  });

  it("refuses a password made from the owner's own details", () => {
    const ctx = { email: 'sara.khan91@example.com', phone: '+923001234567', name: 'Sara Khan' };
    expect(checkPassword('Sarakhan91!!x', ctx)).toBe('PERSONAL'); // e-mail name
    expect(checkPassword('x-3001234567-y', ctx)).toBe('PERSONAL'); // phone number
    expect(checkPassword('my-sara-garden-1', ctx)).toBe('PERSONAL'); // first name
    expect(checkPassword('KHAN-the-great-7', ctx)).toBe('PERSONAL'); // last name, any case
    expect(checkPassword('purple-giraffe-42', ctx)).toBeNull();
  });

  it('refuses the brand name, and ignores very short names and e-mail names', () => {
    expect(checkPassword('Nuray-Secret-99')).toBe('PERSONAL');
    expect(checkPassword('purple-giraffe-42', { email: 'al@example.com', name: 'Al Bo' })).toBeNull();
  });

  it('asks staff for twelve characters', () => {
    expect(MIN_STAFF_PASSWORD_LENGTH).toBe(12);
    expect(checkPassword('purple-giraf', { minLength: MIN_STAFF_PASSWORD_LENGTH })).toBeNull(); // 12
    expect(checkPassword('purple-gira', { minLength: MIN_STAFF_PASSWORD_LENGTH })).toBe('TOO_SHORT'); // 11
  });
});

describe('assertPasswordStrength', () => {
  const failure = (fn: () => void) => {
    try {
      fn();
    } catch (e: any) {
      return e;
    }
    return null;
  };

  it('answers 400 WEAK_PASSWORD with the reason, so a screen can say it in the right language', () => {
    const e = failure(() => assertPasswordStrength('password123'));
    expect(e).toMatchObject({ statusCode: 400, code: 'WEAK_PASSWORD', details: { reason: 'COMMON', minLength: 8 } });
    expect(failure(() => assertPasswordStrength('short'))).toMatchObject({ details: { reason: 'TOO_SHORT' } });
    expect(failure(() => assertPasswordStrength('purple-giraf', { minLength: 20 }))).toMatchObject({ details: { reason: 'TOO_SHORT', minLength: 20 } });
  });

  it('treats a missing or non-text password as too short', () => {
    expect(failure(() => assertPasswordStrength(undefined))).toMatchObject({ code: 'WEAK_PASSWORD', details: { reason: 'TOO_SHORT' } });
    expect(failure(() => assertPasswordStrength({ $gt: '' }))).toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('lets a good password through', () => {
    expect(failure(() => assertPasswordStrength('purple-giraffe-42'))).toBeNull();
  });
});
