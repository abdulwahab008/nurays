import webpush from 'web-push';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Web push: notifications on a person's phone or computer even when Nuray isn't open.
 * Needs VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, generated once with
 * `npx web-push generate-vapid-keys`); without them push is simply off.
 */

let configuredWith: string | null = null;

export function vapidPublicKey(): string | null {
  const key = (process.env.VAPID_PUBLIC_KEY || '').trim();
  return key && (process.env.VAPID_PRIVATE_KEY || '').trim() ? key : null;
}

export const pushConfigured = () => vapidPublicKey() !== null;

function ensureConfigured(): boolean {
  const publicKey = vapidPublicKey();
  if (!publicKey) return false;
  if (configuredWith !== publicKey) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@nuray.pk', publicKey, process.env.VAPID_PRIVATE_KEY!.trim());
    configuredWith = publicKey;
  }
  return true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Remember this device for the user (a device that changed hands moves to its new owner). */
export async function saveSubscription(userId: string, sub: PushSubscriptionInput, userAgent?: string) {
  if (!/^https:\/\//.test(sub.endpoint)) throw new AppError('Invalid push subscription', 400, 'INVALID_SUBSCRIPTION');
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
  });
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

/**
 * Send to every device the user turned push on for. Devices that unsubscribed (404 / 410) are
 * forgotten. Throws when a device failed for another reason, so the job is retried; devices
 * already reached are not sent to twice within a run, but a retry may resend to them.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  let lastError: unknown = null;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        TTL: 60 * 60 * 24,
        urgency: 'high',
        timeout: 10_000,
      });
      delivered++;
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        lastError = err;
        logger.warn({ err: { message: err?.message, statusCode: err?.statusCode }, userId }, 'Push delivery failed');
      }
    }
  }
  if (lastError && delivered === 0) throw lastError;
  return delivered;
}
