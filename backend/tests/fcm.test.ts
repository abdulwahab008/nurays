/**
 * Android push through FCM (utils/fcm.ts): the service account setting, the sign-in at Google (a JWT signed with the
 * account's key, traded for an access token that is reused), the message sent, and which failures mean the phone is gone.
 */
import crypto from 'crypto';
import { fcmConfigured, fcmServiceAccount, FcmError, resetFcmToken, sendFcm } from '../src/utils/fcm';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { project_id: 'nuray-test', client_email: 'push@nuray-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const account = { projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: jest.SpyInstance;

beforeEach(() => {
  resetFcmToken();
  fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) =>
    String(url).startsWith('https://oauth2.googleapis.com/') ? json(200, { access_token: 'ya29.token', expires_in: 3600 }) : json(200, { name: 'projects/nuray-test/messages/1' }),
  );
});
afterEach(() => fetchMock.mockRestore());

describe('FCM_SERVICE_ACCOUNT', () => {
  it('is read as JSON or as base64, and unset means off', () => {
    expect(fcmServiceAccount({ FCM_SERVICE_ACCOUNT: JSON.stringify(key) })).toEqual(account);
    expect(fcmServiceAccount({ FCM_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(key)).toString('base64') })).toEqual(account);
    expect(fcmServiceAccount({})).toBeNull();
    expect(fcmConfigured({})).toBe(false);
  });

  it('refuses a value that is not a service account key, saying what it needs', () => {
    expect(() => fcmServiceAccount({ FCM_SERVICE_ACCOUNT: 'not json' })).toThrow(/service account JSON key/);
    expect(() => fcmServiceAccount({ FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'x' }) })).toThrow(/project_id, client_email and private_key/);
    expect(fcmConfigured({ FCM_SERVICE_ACCOUNT: '{}' })).toBe(false);
  });
});

describe('sendFcm', () => {
  it('signs in as the service account and sends the notification with its link and tag', async () => {
    await sendFcm(account, 'device-token-1', { title: 'New order', body: 'Order #12', url: '/seller/orders/12', tag: 'order-12' });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(String(tokenInit.body));
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, p, sig] = params.get('assertion')!.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims).toMatchObject({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url'))).toBe(true);

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/nuray-test/messages:send');
    expect(sendInit.headers.authorization).toBe('Bearer ya29.token');
    expect(JSON.parse(sendInit.body)).toEqual({
      message: {
        token: 'device-token-1',
        notification: { title: 'New order', body: 'Order #12' },
        data: { url: '/seller/orders/12' },
        android: { priority: 'HIGH', ttl: '86400s', notification: { tag: 'order-12' } },
      },
    });
  });

  it('reuses the access token for the next sends', async () => {
    await sendFcm(account, 'a', { title: 't', body: 'b' });
    await sendFcm(account, 'b', { title: 't', body: 'b' });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth2')).length).toBe(1);
  });

  it('says the phone is gone for UNREGISTERED, and not for other failures', async () => {
    const failWith = async (status: number, errorCode?: string) => {
      fetchMock.mockImplementation(async (url) =>
        String(url).includes('oauth2') ? json(200, { access_token: 'ya29.token', expires_in: 3600 }) : json(status, { error: { status: errorCode ?? 'INTERNAL', details: errorCode ? [{ errorCode }] : [] } }),
      );
      return sendFcm(account, 'x', { title: 't', body: 'b' }).catch((e: FcmError) => ({ status: e.statusCode, gone: e.gone }));
    };
    expect(await failWith(404, 'UNREGISTERED')).toEqual({ status: 404, gone: true });
    expect(await failWith(400, 'INVALID_ARGUMENT')).toEqual({ status: 400, gone: false });
    expect(await failWith(500)).toEqual({ status: 500, gone: false });
    expect(await failWith(429, 'QUOTA_EXCEEDED')).toEqual({ status: 429, gone: false });
  });

  it('fails without sending when Google refuses the service account', async () => {
    fetchMock.mockImplementation(async () => json(400, { error: 'invalid_grant' }));
    await expect(sendFcm(account, 'x', { title: 't', body: 'b' })).rejects.toMatchObject({ name: 'FcmError', statusCode: 400, gone: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
