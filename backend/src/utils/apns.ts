/**
 * Sending to iPhones through Apple Push Notification service, over HTTP/2 with a token (a JWT signed ES256 with the
 * team's .p8 key, reused for up to 50 minutes: Apple refuses one older than an hour and one renewed too often).
 * Configured by APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY (the .p8 file's text; "\n" may stand for line breaks),
 * plus APNS_BUNDLE_ID (default pk.nuray.app) and APNS_SANDBOX=true for development builds.
 */
import crypto from 'crypto';
import http2 from 'http2';
import type { NativePush } from './fcm';

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  sandbox: boolean;
}

/** The APNs settings, or null when none is set. Throws when only some are set, or the key is unusable. */
export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = (env.APNS_KEY_ID || '').trim();
  const teamId = (env.APNS_TEAM_ID || '').trim();
  const privateKey = (env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!keyId && !teamId && !privateKey) return null;
  if (!keyId || !teamId || !privateKey) throw new Error('iPhone push needs APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY together (or none of them).');
  try {
    const key = crypto.createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'ec') throw new Error('not EC');
  } catch {
    throw new Error('APNS_PRIVATE_KEY is not the .p8 key from Apple Developer (Keys, Apple Push Notifications service).');
  }
  return { keyId, teamId, privateKey, bundleId: (env.APNS_BUNDLE_ID || 'pk.nuray.app').trim(), sandbox: (env.APNS_SANDBOX || '').trim().toLowerCase() === 'true' };
}

export const apnsConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => {
  try {
    return apnsConfig(env) !== null;
  } catch {
    return false;
  }
};

let cached: { key: string; jwt: string; issuedAt: number } | null = null;

function providerToken(config: ApnsConfig, now = Date.now()): string {
  const key = `${config.teamId}|${config.keyId}`;
  if (cached && cached.key === key && now - cached.issuedAt < 50 * 60_000) return cached.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: config.keyId })}.${b64({ iss: config.teamId, iat: Math.floor(now / 1000) })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: config.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  cached = { key, jwt: `${unsigned}.${signature}`, issuedAt: now };
  return cached.jwt;
}

/** A send that failed. `gone`: the token no longer reaches a phone (the app was removed, or the token is not one). */
export class ApnsError extends Error {
  constructor(message: string, readonly statusCode: number, readonly gone: boolean) {
    super(message);
    this.name = 'ApnsError';
  }
}

export type Connect = (authority: string) => http2.ClientHttp2Session;

const host = (config: ApnsConfig) => (config.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');

/** Send one notification to one iPhone. `connect` is for tests. */
export async function sendApns(config: ApnsConfig, deviceToken: string, push: NativePush, connect: Connect = (a) => http2.connect(a)): Promise<void> {
  const payload = JSON.stringify({ aps: { alert: { title: push.title, body: push.body }, sound: 'default' }, ...(push.url ? { url: push.url } : {}) });
  const headers: http2.OutgoingHttpHeaders = {
    ':method': 'POST',
    ':path': `/3/device/${encodeURIComponent(deviceToken)}`,
    authorization: `bearer ${providerToken(config)}`,
    'apns-topic': config.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 86_400),
  };
  if (push.tag) headers['apns-collapse-id'] = Buffer.from(push.tag).subarray(0, 64).toString();

  const session = connect(host(config));
  try {
    const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      session.once('error', reject);
      const req = session.request(headers);
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      let status = 0;
      let body = '';
      req.on('response', (h) => {
        status = Number(h[':status']);
      });
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => resolve({ status, body }));
      req.on('error', reject);
      req.on('close', () => {
        if (!status) reject(new Error('APNs did not answer'));
      });
      req.end(payload);
    });
    if (status === 200) return;
    const reason = (() => {
      try {
        return (JSON.parse(body) as { reason?: string }).reason;
      } catch {
        return undefined;
      }
    })();
    if (status === 403 && (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')) cached = null;
    // 410 Unregistered: the app is gone from that phone. BadDeviceToken: not a token for this app and server.
    throw new ApnsError(`APNs answered ${status} ${reason ?? ''}`.trim(), status, status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered');
  } finally {
    session.close();
  }
}

/** Forget the cached provider token (tests). */
export const resetApnsToken = (): void => {
  cached = null;
};
