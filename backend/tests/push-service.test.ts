/**
 * The push service across its three kinds of device (services/push.service.ts): what is saved for a browser and for a
 * store app, that each device goes to its own sender, that a kind this server has no settings for is skipped, and that
 * a device that is gone is forgotten while one that failed for another reason makes the job retry.
 */
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { pushSubscription: { upsert: jest.fn(async () => ({})), findMany: jest.fn(), update: jest.fn(async () => ({})), delete: jest.fn(async () => ({})) } },
}));
jest.mock('web-push', () => ({ __esModule: true, default: { setVapidDetails: jest.fn(), sendNotification: jest.fn(async () => ({})) } }));
jest.mock('../src/utils/fcm', () => ({ ...jest.requireActual('../src/utils/fcm'), sendFcm: jest.fn(async () => undefined) }));
jest.mock('../src/utils/apns', () => ({ ...jest.requireActual('../src/utils/apns'), sendApns: jest.fn(async () => undefined) }));

import crypto from 'crypto';
import webpush from 'web-push';
import prisma from '../src/config/database';
import { sendFcm, FcmError } from '../src/utils/fcm';
import { sendApns, ApnsError } from '../src/utils/apns';
import { pushConfigured, pushPlatforms, saveSubscription, sendPushToUser } from '../src/services/push.service';

const db = prisma as unknown as { pushSubscription: Record<'upsert' | 'findMany' | 'update' | 'delete', jest.Mock> };
const web = (webpush as unknown as { sendNotification: jest.Mock }).sendNotification;
const fcm = sendFcm as jest.Mock;
const apns = sendApns as jest.Mock;

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const SETTINGS = {
  VAPID_PUBLIC_KEY: 'BPublicKey',
  VAPID_PRIVATE_KEY: 'private',
  FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'p', client_email: 'e@p.iam.gserviceaccount.com', private_key: rsa }),
  APNS_KEY_ID: 'K',
  APNS_TEAM_ID: 'T',
  APNS_PRIVATE_KEY: ec,
};
const setOnly = (...names: Array<keyof typeof SETTINGS>) => {
  for (const name of Object.keys(SETTINGS)) delete process.env[name];
  for (const name of names) process.env[name] = SETTINGS[name];
};

const devices = [
  { id: 'w', platform: 'web', endpoint: 'https://push.example/abc', p256dh: 'p256dh-key', auth: 'auth-key' },
  { id: 'a', platform: 'android', endpoint: 'fcm-token', p256dh: null, auth: null },
  { id: 'i', platform: 'ios', endpoint: 'apns-token', p256dh: null, auth: null },
];
const payload = { title: 'New order', body: 'Order #1', url: '/seller/orders/1', tag: 'o1' };

beforeEach(() => {
  setOnly('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'FCM_SERVICE_ACCOUNT', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY');
  for (const m of [...Object.values(db.pushSubscription), web, fcm, apns]) m.mockClear();
  db.pushSubscription.findMany.mockResolvedValue(devices);
});
afterAll(() => setOnly());

describe('which kinds are on', () => {
  it('follows the settings, one kind at a time', () => {
    expect(pushPlatforms()).toEqual({ web: true, android: true, ios: true });
    setOnly('FCM_SERVICE_ACCOUNT');
    expect(pushPlatforms()).toEqual({ web: false, android: true, ios: false });
    expect(pushConfigured()).toBe(true);
    setOnly();
    expect(pushConfigured()).toBe(false);
  });
});

describe('saveSubscription', () => {
  it('keeps a browser with its keys, and a store app by its token with none', async () => {
    await saveSubscription('u1', { endpoint: 'https://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } }, 'Firefox');
    expect(db.pushSubscription.upsert.mock.calls[0][0]).toMatchObject({
      where: { endpoint: 'https://push.example/abc' },
      create: { userId: 'u1', platform: 'web', p256dh: 'k1', auth: 'k2', userAgent: 'Firefox' },
    });
    await saveSubscription('u2', { platform: 'ios', token: 'apns-token' });
    expect(db.pushSubscription.upsert.mock.calls[1][0]).toMatchObject({
      where: { endpoint: 'apns-token' },
      create: { endpoint: 'apns-token', userId: 'u2', platform: 'ios', p256dh: null, auth: null },
      update: { userId: 'u2', platform: 'ios' },
    });
  });

  it('refuses a browser endpoint that is not https', async () => {
    await expect(saveSubscription('u1', { endpoint: 'http://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } })).rejects.toMatchObject({ code: 'INVALID_SUBSCRIPTION' });
  });
});

describe('sendPushToUser', () => {
  it('sends each device through its own way', async () => {
    expect(await sendPushToUser('u1', payload)).toBe(3);
    expect(web).toHaveBeenCalledWith({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }, JSON.stringify(payload), expect.any(Object));
    expect(fcm).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p' }), 'fcm-token', payload);
    expect(apns).toHaveBeenCalledWith(expect.objectContaining({ keyId: 'K', teamId: 'T' }), 'apns-token', payload);
    expect(db.pushSubscription.update).toHaveBeenCalledTimes(3);
  });

  it('skips the kinds this server has no settings for', async () => {
    setOnly('APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY');
    expect(await sendPushToUser('u1', payload)).toBe(1);
    expect(web).not.toHaveBeenCalled();
    expect(fcm).not.toHaveBeenCalled();
    expect(apns).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when no kind is set up', async () => {
    setOnly();
    expect(await sendPushToUser('u1', payload)).toBe(0);
    expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('forgets the devices that are gone and keeps the rest', async () => {
    web.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    fcm.mockRejectedValueOnce(new FcmError('FCM answered 404 UNREGISTERED', 404, true));
    apns.mockRejectedValueOnce(new ApnsError('APNs answered 400 PayloadTooLarge', 400, false));
    // One failed for another reason and none was reached: the job is retried.
    await expect(sendPushToUser('u1', payload)).rejects.toThrow(/PayloadTooLarge/);
    expect(db.pushSubscription.delete.mock.calls.map(([q]) => q.where.id).sort()).toEqual(['a', 'w']);
  });

  it('counts a run that reached someone as done, even when another device failed', async () => {
    fcm.mockRejectedValueOnce(new FcmError('FCM answered 503', 503, false));
    expect(await sendPushToUser('u1', payload)).toBe(2);
    expect(db.pushSubscription.delete).not.toHaveBeenCalled();
  });
});
