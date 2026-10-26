/**
 * Sign in with Apple hands the app an identity token (an RS256 JWT). It is trusted only when the signature matches one
 * of Apple's published keys and the issuer, audience (the app's bundle id), expiry and verified e-mail check out. The
 * checks sign tokens with a key made for the test and serve its public half as if it were Apple's.
 */
import { createSign, generateKeyPairSync } from 'crypto';
import { AppleIdTokenError, resetAppleKeyCache, verifyAppleIdToken } from '../src/utils/apple-id-token';
import { resetGoogleKeyCache, verifyGoogleIdToken } from '../src/utils/google-id-token';

const BUNDLE = 'pk.nuray.app';
const NOW = 1_800_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'apple-1', alg: 'RS256', use: 'sig' };

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(claims: Record<string, unknown>, alg = 'RS256') {
  const body = `${b64({ alg, kid: 'apple-1' })}.${b64(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return `${body}.${signer.sign(privateKey).toString('base64url')}`;
}
// Apple sends email_verified (and is_private_email) as strings.
const good = (over: Record<string, unknown> = {}) => ({
  iss: 'https://appleid.apple.com',
  aud: BUNDLE,
  sub: '001234.abcdef.0001',
  email: 'X7k2@privaterelay.appleid.com',
  email_verified: 'true',
  is_private_email: 'true',
  iat: NOW - 30,
  exp: NOW + 600,
  ...over,
});

const urls: string[] = [];
const fetchImpl = async (url: string) => {
  urls.push(url);
  return { ok: true, headers: { get: () => 'max-age=3600' }, json: async () => ({ keys: [jwk] }) };
};
const verify = (token: string) => verifyAppleIdToken(token, { audiences: [BUNDLE], nowSeconds: NOW, fetchImpl });
const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'accepted';
  } catch (err) {
    return err instanceof AppleIdTokenError ? err.reason : `other: ${String(err)}`;
  }
};

beforeEach(() => {
  resetAppleKeyCache();
  resetGoogleKeyCache();
  urls.length = 0;
});

it("accepts Apple's token for the app, with the relay e-mail lower-cased and no name", async () => {
  await expect(verify(sign(good()))).resolves.toEqual({ subject: '001234.abcdef.0001', email: 'x7k2@privaterelay.appleid.com', name: '', picture: null });
  expect(urls).toEqual(['https://appleid.apple.com/auth/keys']);
});

it('refuses what a forger could try', async () => {
  expect(await reasonOf(verify(sign(good({ iss: 'https://accounts.google.com' }))))).toBe('issuer');
  expect(await reasonOf(verify(sign(good({ aud: 'com.someone.else' }))))).toBe('audience');
  expect(await reasonOf(verify(sign(good({ exp: NOW - 120 }))))).toBe('expired');
  expect(await reasonOf(verify(sign(good({ email_verified: 'false' }))))).toBe('email_unverified');
  expect(await reasonOf(verify(sign(good({ email: undefined }))))).toBe('no_email');
  expect(await reasonOf(verify(sign(good(), 'none')))).toBe('algorithm');
  const token = sign(good());
  expect(await reasonOf(verify(`${token.slice(0, token.lastIndexOf('.'))}.${'A'.repeat(342)}`))).toBe('signature');
});

it("keeps Apple's keys and Google's apart: an Apple token is no Google token", async () => {
  const appleToken = sign(good({ aud: 'web.apps.googleusercontent.com' }));
  const googleKeysFetch = async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ keys: [{ ...jwk, kid: 'other' }] }) });
  await expect(verifyGoogleIdToken(appleToken, { audiences: ['web.apps.googleusercontent.com'], nowSeconds: NOW, fetchImpl: googleKeysFetch })).rejects.toMatchObject({ reason: 'unknown_key' });
});
