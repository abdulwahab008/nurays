import webpush from 'web-push';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { thrown } from '../utils/thrown';
import { fcmConfigured, fcmServiceAccount, sendFcm } from '../utils/fcm';
import { apnsConfig, apnsConfigured, sendApns } from '../utils/apns';

/**
 * Push: notifications on a person's phone or computer even when Nuray isn't open. Three ways, each on when its
 * settings are there and off otherwise:
 * - web: a browser's push service, with VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, generated once with
 *   `npx web-push generate-vapid-keys`);
 * - android: the store app through Firebase Cloud Messaging (FCM_SERVICE_ACCOUNT, utils/fcm.ts);
 * - ios: the store app through Apple's push service (APNS_*, utils/apns.ts).
 */

export type PushPlatform = 'web' | 'android' | 'ios';

let configuredWith: string | null = null;

export function vapidPublicKey(): string | null {
  const key = (process.env.VAPID_PUBLIC_KEY || '').trim();
  return key && (process.env.VAPID_PRIVATE_KEY || '').trim() ? key : null;
}

/** Which ways of pushing this server has settings for. */
export const pushPlatforms = (): Record<PushPlatform, boolean> => ({ web: vapidPublicKey() !== null, android: fcmConfigured(), ios: apnsConfigured() });

/** Whether this server can push at all, one way or another. */
export const pushConfigured = () => Object.values(pushPlatforms()).some(Boolean);

function ensureConfigured(): boolean {
  const publicKey = vapidPublicKey();
  if (!publicKey) return false;
  if (configuredWith !== publicKey) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@nuray.pk', publicKey, process.env.VAPID_PRIVATE_KEY!.trim());
    configuredWith = publicKey;
  }
  return true;
}

/** A browser's subscription (as `PushSubscription.toJSON()` gives it), or a store app's device token. */
export type PushSubscriptionInput =
  | { platform?: 'web'; endpoint: string; keys: { p256dh: string; auth: string } }
  | { platform: 'android' | 'ios'; token: string };

/** Remember this device for the user (a device that changed hands moves to its new owner). */
export async function saveSubscription(userId: string, sub: PushSubscriptionInput, userAgent?: string) {
  const agent = userAgent?.slice(0, 300) ?? null;
  if ('token' in sub) {
    const fields = { userId, platform: sub.platform, p256dh: null, auth: null, userAgent: agent };
    await prisma.pushSubscription.upsert({ where: { endpoint: sub.token }, create: { endpoint: sub.token, ...fields }, update: fields });
    return;
  }
  if (!/^https:\/\//.test(sub.endpoint)) throw new AppError('Invalid push subscription', 400, 'INVALID_SUBSCRIPTION');
  const fields = { userId, platform: 'web', p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: agent };
  await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...fields }, update: fields });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * Forget every device the user turned push on for. Signing out ends every session of the account on every
 * device, so none of them goes on being told about the account's orders afterwards; a device signs up again
 * the next time its owner signs in on it (the web app re-registers the browser's own subscription).
 */
export async function removeAllSubscriptions(userId: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  /** Same tag: a newer notification replaces the older one on the device. */
  tag?: string;
}

type StoredSubscription = { id: string; platform: string; endpoint: string; p256dh: string | null; auth: string | null };

/** The sender for one device, or null when this server has no settings for its kind. */
function senderFor(sub: StoredSubscription): ((payload: PushPayload) => Promise<void>) | null {
  if (sub.platform === 'android') {
    const account = fcmConfigured() ? fcmServiceAccount() : null;
    return account ? (p) => sendFcm(account, sub.endpoint, p) : null;
  }
  if (sub.platform === 'ios') {
    const config = apnsConfigured() ? apnsConfig() : null;
    return config ? (p) => sendApns(config, sub.endpoint, p) : null;
  }
  if (!ensureConfigured() || !sub.p256dh || !sub.auth) return null;
  const keys = { p256dh: sub.p256dh, auth: sub.auth };
  return async (p) => {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys }, JSON.stringify(p), { TTL: 60 * 60 * 24, urgency: 'high', timeout: 10_000 });
  };
}

/** The device is not there any more: a browser that unsubscribed (404 / 410), an app removed from its phone. */
const deviceGone = (err: unknown) => {
  const e = thrown(err) as { statusCode?: number; gone?: boolean };
  return e.gone === true || (e.gone === undefined && (e.statusCode === 404 || e.statusCode === 410));
};

/**
 * Send to every device the user turned push on for (browsers and store apps alike; a kind this server has no
 * settings for is skipped). Devices that are gone are forgotten. Throws when a device failed for another reason
 * and none was reached, so the job is retried; a retry may resend to devices already reached.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, platform: true, endpoint: true, p256dh: true, auth: true } });
  let delivered = 0;
  let lastError: unknown = null;
  for (const sub of subs) {
    const send = senderFor(sub);
    if (!send) continue;
    try {
      await send(payload);
      delivered++;
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    } catch (err) {
      if (deviceGone(err)) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        lastError = err;
        logger.warn({ err: { message: thrown(err).message, statusCode: thrown(err).statusCode }, userId, platform: sub.platform }, 'Push delivery failed');
      }
    }
  }
  if (lastError && delivered === 0) throw lastError;
  return delivered;
}
