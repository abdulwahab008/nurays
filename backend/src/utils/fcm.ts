/**
 * Sending to Android phones through Firebase Cloud Messaging (the HTTP v1 API). The server signs in as the Firebase
 * project's service account: a JWT signed with its private key is traded for an access token at Google, kept until
 * shortly before it expires. Configured by FCM_SERVICE_ACCOUNT, the service account's JSON key (as it is, or base64).
 */
import crypto from 'crypto';

export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** The service account in FCM_SERVICE_ACCOUNT, or null when it is unset. Throws when it is set but unusable. */
export function fcmServiceAccount(env: NodeJS.ProcessEnv = process.env): FcmServiceAccount | null {
  const raw = (env.FCM_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT is not a service account JSON key (as it is, or base64).');
  }
  const projectId = parsed.project_id;
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string' || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('FCM_SERVICE_ACCOUNT needs project_id, client_email and private_key (the JSON key from Firebase, Project settings, Service accounts).');
  }
  return { projectId, clientEmail, privateKey };
}

export const fcmConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => {
  try {
    return fcmServiceAccount(env) !== null;
  } catch {
    return false;
  }
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cached: { key: string; token: string; expiresAt: number } | null = null;

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

async function accessToken(account: FcmServiceAccount, now = Date.now()): Promise<string> {
  const key = `${account.clientEmail}|${account.projectId}`;
  if (cached && cached.key === key && cached.expiresAt - 60_000 > now) return cached.token;
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: account.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey).toString('base64url');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new FcmError(`Google refused the service account (${res.status})`, res.status, false);
  cached = { key, token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** A send that failed. `gone`: the token no longer reaches a phone (the app was removed, or the token replaced). */
export class FcmError extends Error {
  constructor(message: string, readonly statusCode: number, readonly gone: boolean) {
    super(message);
    this.name = 'FcmError';
  }
}

export interface NativePush {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

/** Send one notification to one Android phone. */
export async function sendFcm(account: FcmServiceAccount, token: string, push: NativePush): Promise<void> {
  const bearer = await accessToken(account);
  const data: Record<string, string> = {};
  if (push.url) data.url = push.url;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: push.title, body: push.body },
        data,
        android: { priority: 'HIGH', ttl: '86400s', notification: push.tag ? { tag: push.tag.slice(0, 64) } : {} },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };
  const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status;
  if (res.status === 401) cached = null;
  // UNREGISTERED (404): the app is gone from that phone, or the token was replaced. Nothing else means the token is dead.
  throw new FcmError(`FCM answered ${res.status} ${code ?? ''}`.trim(), res.status, res.status === 404 || code === 'UNREGISTERED');
}

/** Forget the cached access token (tests). */
export const resetFcmToken = (): void => {
  cached = null;
};
