/**
 * iPhone push through APNs (utils/apns.ts), against a local HTTP/2 server standing in for Apple's: the settings, the
 * provider token (ES256 with the team's key, reused), the request Apple expects, and which answers mean the phone is gone.
 */
import crypto from 'crypto';
import http2 from 'http2';
import type { AddressInfo } from 'net';
import { apnsConfig, apnsConfigured, ApnsError, resetApnsToken, sendApns } from '../src/utils/apns';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const config = { keyId: 'KEY1234567', teamId: 'TEAM123456', privateKey: p8, bundleId: 'pk.nuray.app', sandbox: false };

type Seen = { headers: http2.IncomingHttpHeaders; body: string };
let server: http2.Http2Server;
let port = 0;
let seen: Seen[] = [];
let answer: { status: number; body?: object } = { status: 200 };

beforeAll(async () => {
  server = http2.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => {
      seen.push({ headers: req.headers, body });
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body ? JSON.stringify(answer.body) : '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen = [];
  answer = { status: 200 };
  resetApnsToken();
});

const authorities: string[] = [];
const local = (authority: string) => {
  authorities.push(authority);
  return http2.connect(`http://127.0.0.1:${port}`);
};

describe('the APNs settings', () => {
  it('are all or nothing, and the key must be an EC key', () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfigured({})).toBe(false);
    expect(() => apnsConfig({ APNS_KEY_ID: 'K' })).toThrow(/together/);
    expect(() => apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'nope' })).toThrow(/\.p8 key/);
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: rsa })).toThrow(/\.p8 key/);
  });

  it('take the key with "\\n" for line breaks, and default the bundle id', () => {
    const c = apnsConfig({ APNS_KEY_ID: ' K ', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: p8.replace(/\n/g, '\\n'), APNS_SANDBOX: 'true' });
    expect(c).toMatchObject({ keyId: 'K', teamId: 'T', bundleId: 'pk.nuray.app', sandbox: true });
    expect(c!.privateKey).toBe(p8.trim());
  });
});

describe('sendApns', () => {
  it('sends the alert Apple expects, signed with the team key', async () => {
    await sendApns(config, 'abcdef0123', { title: 'On its way', body: 'Your rider picked it up', url: '/orders/9', tag: 'order-9' }, local);
    expect(authorities.pop()).toBe('https://api.push.apple.com');
    const [{ headers, body }] = seen;
    expect(headers[':path']).toBe('/3/device/abcdef0123');
    expect(headers).toMatchObject({ 'apns-topic': 'pk.nuray.app', 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': 'order-9' });
    expect(JSON.parse(body)).toEqual({ aps: { alert: { title: 'On its way', body: 'Your rider picked it up' }, sound: 'default' }, url: '/orders/9' });

    const [h, p, sig] = String(headers.authorization).replace(/^bearer /, '').split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: 'TEAM123456' });
    expect(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('reuses the provider token, and uses the sandbox for development builds', async () => {
    await sendApns(config, 'a1', { title: 't', body: 'b' }, local);
    await sendApns({ ...config, sandbox: true }, 'a2', { title: 't', body: 'b' }, local);
    expect(seen[0].headers.authorization).toBe(seen[1].headers.authorization);
    expect(authorities.pop()).toBe('https://api.sandbox.push.apple.com');
  });

  it('says the phone is gone for 410 and BadDeviceToken, and not for other failures', async () => {
    const failWith = async (status: number, reason: string) => {
      answer = { status, body: { reason } };
      return sendApns(config, 'a1', { title: 't', body: 'b' }, local).catch((e: ApnsError) => ({ status: e.statusCode, gone: e.gone }));
    };
    expect(await failWith(410, 'Unregistered')).toEqual({ status: 410, gone: true });
    expect(await failWith(400, 'BadDeviceToken')).toEqual({ status: 400, gone: true });
    expect(await failWith(400, 'PayloadTooLarge')).toEqual({ status: 400, gone: false });
    expect(await failWith(403, 'InvalidProviderToken')).toEqual({ status: 403, gone: false });
    expect(await failWith(503, 'ServiceUnavailable')).toEqual({ status: 503, gone: false });
  });

  it('fails, without hanging, when Apple cannot be reached', async () => {
    const nowhere = () => http2.connect('http://127.0.0.1:1');
    await expect(sendApns(config, 'a1', { title: 't', body: 'b' }, nowhere)).rejects.toThrow();
  });
});
