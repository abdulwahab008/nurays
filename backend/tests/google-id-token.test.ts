/**
 * A native app signs in with Google by sending an ID token (an RS256 JWT) instead of the access token the web button
 * sends. It is trusted only when the signature matches one of Google's published keys and the issuer, audience,
 * expiry and verified e-mail all check out. The checks here sign tokens with a key made for the test and serve its
 * public half as if it were Google's, so every refusal is something a forger could actually try.
 */
import { createHmac, createSign, generateKeyPairSync } from 'crypto';
import { GoogleIdTokenError, resetGoogleKeyCache, verifyGoogleIdToken } from '../src/utils/google-id-token';

const WEB = 'web-client.apps.googleusercontent.com';
const ANDROID = 'android-client.apps.googleusercontent.com';
const NOW = 1_800_000_000;

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
let { privateKey, publicKey } = pair();
const jwkOf = (key: typeof publicKey, kid: string) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(claims: Record<string, unknown>, opts: { kid?: string; alg?: string; key?: typeof privateKey } = {}) {
  const header = { alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? 'key-1' };
  const body = `${b64(header)}.${b64(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return `${body}.${signer.sign(opts.key ?? privateKey).toString('base64url')}`;
}
const good = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: WEB,
  sub: '1234567890',
  email: 'Rider@Example.com',
  email_verified: true,
  name: 'Rana Rider',
  picture: 'https://lh3.example/photo.jpg',
  iat: NOW - 60,
  exp: NOW + 3000,
  ...over,
});

let keys: Array<Record<string, unknown>>;
let fetchCalls: number;
let certsOk: boolean;
let cacheControl: string;
const fetchImpl = async () => {
  fetchCalls++;
  return { ok: certsOk, headers: { get: () => cacheControl }, json: async () => ({ keys }) };
};
const verify = (token: string, over: { audiences?: string[]; nowSeconds?: number } = {}) =>
  verifyGoogleIdToken(token, { audiences: over.audiences ?? [WEB], nowSeconds: over.nowSeconds ?? NOW, fetchImpl });
const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'accepted';
  } catch (err) {
    return err instanceof GoogleIdTokenError ? err.reason : `other: ${String(err)}`;
  }
};

beforeEach(() => {
  resetGoogleKeyCache();
  ({ privateKey, publicKey } = pair());
  keys = [jwkOf(publicKey, 'key-1')];
  fetchCalls = 0;
  certsOk = true;
  cacheControl = 'public, max-age=3600';
});

describe('a good token', () => {
  it('says who Google vouches for, with the e-mail lower-cased', async () => {
    expect(await verify(sign(good()))).toEqual({ subject: '1234567890', email: 'rider@example.com', name: 'Rana Rider', picture: 'https://lh3.example/photo.jpg' });
  });

  it('may have been issued to the app\'s Android client as well as its web client', async () => {
    const token = sign(good({ aud: ANDROID }));
    expect(await reasonOf(verify(token, { audiences: [WEB] }))).toBe('audience');
    expect(await reasonOf(verify(token, { audiences: [WEB, ANDROID] }))).toBe('accepted');
  });

  it('accepts the other spelling of the issuer and an e-mail flag sent as the string "true"', async () => {
    expect(await reasonOf(verify(sign(good({ iss: 'accounts.google.com', email_verified: 'true' }))))).toBe('accepted');
  });

  it('survives a few seconds of clock drift either way', async () => {
    expect(await reasonOf(verify(sign(good({ exp: NOW - 30 }))))).toBe('accepted');
    expect(await reasonOf(verify(sign(good({ iat: NOW + 30 }))))).toBe('accepted');
  });
});

describe('a token that is not to be trusted', () => {
  it('refuses something that is not a JWT', async () => {
    const junk = ['', 'abc', 'a.b', 'a.b.c.d', '..', 'e30.e30.', 'not base64.not base64.sig'];
    const reasons = await Promise.all(junk.map((token) => reasonOf(verify(token))));
    expect(reasons).toEqual(junk.map(() => 'malformed'));
  });

  it('refuses any algorithm but RS256, including "none" and a symmetric one keyed with the public key', async () => {
    const claims = good();
    const none = `${b64({ alg: 'none', typ: 'JWT', kid: 'key-1' })}.${b64(claims)}.`;
    expect(await reasonOf(verify(none))).toBe('malformed'); // an empty signature part
    const noneWithSignature = `${b64({ alg: 'none', kid: 'key-1' })}.${b64(claims)}.c2ln`;
    expect(await reasonOf(verify(noneWithSignature))).toBe('algorithm');
    // HS256 with the public key as the secret: the classic key-confusion forgery
    const body = `${b64({ alg: 'HS256', typ: 'JWT', kid: 'key-1' })}.${b64(claims)}`;
    const forged = `${body}.${createHmac('sha256', publicKey.export({ type: 'spki', format: 'pem' })).update(body).digest('base64url')}`;
    expect(await reasonOf(verify(forged))).toBe('algorithm');
  });

  it('refuses a token signed by somebody else\'s key, or altered after it was signed', async () => {
    const stranger = pair();
    expect(await reasonOf(verify(sign(good(), { key: stranger.privateKey })))).toBe('signature');
    const [head, , sig] = sign(good()).split('.');
    expect(await reasonOf(verify(`${head}.${b64(good({ email: 'victim@example.com' }))}.${sig}`))).toBe('signature');
  });

  it('refuses a key id Google does not publish, after looking once more', async () => {
    expect(await reasonOf(verify(sign(good(), { kid: 'made-up' })))).toBe('unknown_key');
    expect(fetchCalls).toBe(1);
  });

  it('refuses the wrong issuer, audience, subject, expiry, e-mail', async () => {
    expect(await reasonOf(verify(sign(good({ iss: 'https://evil.example' }))))).toBe('issuer');
    expect(await reasonOf(verify(sign(good({ aud: 'some-other-app' }))))).toBe('audience');
    expect(await reasonOf(verify(sign(good({ aud: [WEB] }))))).toBe('audience'); // Google sends a string
    expect(await reasonOf(verify(sign(good({ aud: undefined }))))).toBe('audience');
    expect(await reasonOf(verify(sign(good({ exp: NOW - 120 }))))).toBe('expired');
    expect(await reasonOf(verify(sign(good({ exp: undefined }))))).toBe('expired');
    expect(await reasonOf(verify(sign(good({ iat: NOW + 600 }))))).toBe('expired');
    expect(await reasonOf(verify(sign(good({ sub: '' }))))).toBe('no_subject');
    expect(await reasonOf(verify(sign(good({ email: undefined }))))).toBe('no_email');
    expect(await reasonOf(verify(sign(good({ email_verified: false }))))).toBe('email_unverified');
    expect(await reasonOf(verify(sign(good({ email_verified: undefined }))))).toBe('email_unverified');
    expect(await reasonOf(verify(sign(good({ email_verified: 'yes' }))))).toBe('email_unverified');
  });

  it('is refused when no audience is configured', async () => {
    expect(await reasonOf(verify(sign(good()), { audiences: [] }))).toBe('audience');
  });
});

describe("Google's keys", () => {
  it('are fetched once and used for as long as Google says they are good', async () => {
    await verify(sign(good()));
    await verify(sign(good()));
    expect(fetchCalls).toBe(1);
    await verify(sign(good({ iat: NOW + 3400, exp: NOW + 6000 })), { nowSeconds: NOW + 3500 }); // within the hour
    expect(fetchCalls).toBe(1);
    await verify(sign(good({ iat: NOW + 3500, exp: NOW + 7000 })), { nowSeconds: NOW + 3700 }); // an hour after they were fetched
    expect(fetchCalls).toBe(2);
  });

  it('are fetched again for a new key id, so a rotation does not lock everybody out', async () => {
    await verify(sign(good()));
    const rotated = pair();
    keys = [jwkOf(publicKey, 'key-1'), jwkOf(rotated.publicKey, 'key-2')];
    // within a minute of the last fetch a new key id is not worth another call
    expect(await reasonOf(verify(sign(good(), { kid: 'key-2', key: rotated.privateKey }), { nowSeconds: NOW + 30 }))).toBe('unknown_key');
    expect(fetchCalls).toBe(1);
    // after that it is
    expect(await reasonOf(verify(sign(good({ iat: NOW + 30, exp: NOW + 3000 }), { kid: 'key-2', key: rotated.privateKey }), { nowSeconds: NOW + 90 }))).toBe('accepted');
    expect(fetchCalls).toBe(2);
  });

  it('are fetched once however many sign-ins arrive while the first fetch is under way', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => reasonOf(verify(sign(good())))));
    expect(results).toEqual(Array(5).fill('accepted'));
    expect(fetchCalls).toBe(1);
  });

  it('being out of reach is reported as such, not as a bad token', async () => {
    certsOk = false;
    expect(await reasonOf(verify(sign(good())))).toBe('unavailable');
  });

  it('being out of reach later does not matter while the keys we hold are still the ones Google uses', async () => {
    await verify(sign(good()));
    certsOk = false;
    expect(await reasonOf(verify(sign(good({ iat: NOW + 4000, exp: NOW + 8000 })), { nowSeconds: NOW + 4100 }))).toBe('accepted');
  });

  it('answering with no usable keys is out of reach too', async () => {
    keys = [{ kty: 'EC', kid: 'ec' }, { kid: 'no-modulus', kty: 'RSA' }];
    expect(await reasonOf(verify(sign(good())))).toBe('unavailable');
  });

  it('keep for no less than a minute and no more than a day, whatever the cache header says', async () => {
    cacheControl = 'max-age=1';
    await verify(sign(good()));
    await verify(sign(good()), { nowSeconds: NOW + 30 });
    expect(fetchCalls).toBe(1); // not refetched within the minute
    resetGoogleKeyCache();
    fetchCalls = 0;
    cacheControl = 'max-age=99999999';
    await verify(sign(good()));
    await verify(sign(good({ iat: NOW + 86_000, exp: NOW + 90_000 })), { nowSeconds: NOW + 86_000 });
    expect(fetchCalls).toBe(1); // within a day
    await verify(sign(good({ iat: NOW + 87_000, exp: NOW + 91_000 })), { nowSeconds: NOW + 87_000 });
    expect(fetchCalls).toBe(2); // past it
  });
});
