import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import socketManager from '../config/socket';
import { AppError } from '../middleware/errorHandler';
import { smsProvider } from '../config/env';
import { logger } from '../utils/logger';
import { pushConfigured } from './push.service';
import { queueDelivery, DeliveryChannel } from '../jobs/notify.jobs';

/**
 * Notifications. Every one lands in the person's in-app list (and their open tabs, live).
 * Each kind of event also says which other channels it is worth: push for most, email for
 * the ones worth keeping, SMS only when someone must act now (a kitchen's new order, a
 * cancelled or failed delivery). The person's preferences decide which of those they get.
 */

export const NOTIFICATION_CATEGORIES = ['orders', 'payments', 'deliveries'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const DELIVERY_CHANNELS: DeliveryChannel[] = ['push', 'email', 'sms'];

export type Preferences = Record<NotificationCategory, Record<DeliveryChannel, boolean>>;

const DEFAULTS: Preferences = {
  orders: { push: true, email: true, sms: true },
  payments: { push: true, email: true, sms: true },
  deliveries: { push: true, email: false, sms: false },
};

/** Stored preferences over the defaults (anything missing or malformed counts as the default). */
export function resolvePreferences(stored: unknown): Preferences {
  const out = JSON.parse(JSON.stringify(DEFAULTS)) as Preferences;
  if (stored && typeof stored === 'object') {
    for (const category of NOTIFICATION_CATEGORIES) {
      const row = (stored as Record<string, unknown>)[category];
      if (!row || typeof row !== 'object') continue;
      for (const channel of DELIVERY_CHANNELS) {
        const v = (row as Record<string, unknown>)[channel];
        if (typeof v === 'boolean') out[category][channel] = v;
      }
    }
  }
  return out;
}

/** The kinds of notification each kind of account receives (for the settings screen). */
export function categoriesFor(userType: string): NotificationCategory[] {
  return userType === 'rider' ? ['deliveries', 'payments'] : ['orders', 'payments'];
}

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true, email: true, emailVerified: true, phone: true, phoneVerified: true, notificationPreferences: true },
  });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return {
    preferences: resolvePreferences(user.notificationPreferences),
    categories: categoriesFor(user.userType),
    // Whether each channel can reach this person at all, and why not.
    channels: {
      push: { available: pushConfigured(), reason: pushConfigured() ? null : 'Push notifications are not set up on this server yet.' },
      email: { available: !!user.email && user.emailVerified, reason: !user.email ? 'Add an email address to your profile.' : user.emailVerified ? null : 'Verify your email address first.' },
      sms: {
        available: smsProvider() !== 'none' && user.phoneVerified,
        reason: smsProvider() === 'none' ? 'Text messages are not set up on this server yet.' : user.phoneVerified ? null : 'Verify your phone number first.',
      },
    },
  };
}

export async function updatePreferences(userId: string, input: unknown) {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
  if (!current) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  // Merge onto what is stored: a screen showing only some kinds never resets the others.
  const merged = resolvePreferences(current.notificationPreferences);
  if (input && typeof input === 'object') {
    for (const category of NOTIFICATION_CATEGORIES) {
      const row = (input as Record<string, unknown>)[category];
      if (!row || typeof row !== 'object') continue;
      for (const channel of DELIVERY_CHANNELS) {
        const v = (row as Record<string, unknown>)[channel];
        if (typeof v === 'boolean') merged[category][channel] = v;
      }
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { notificationPreferences: merged as unknown as Prisma.InputJsonValue } });
  return getPreferences(userId);
}

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  /** Kept for the in-app list's icons and filters (order, payment, delivery...). */
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
  /** Channels this event is worth besides the in-app list. */
  channels?: DeliveryChannel[];
  /** One notification per event: a repeat with the same key is ignored. */
  dedupeKey?: string;
}

/**
 * Notify one person. Never throws: a notification failing must not fail what triggered it.
 * Returns the notification's id, or null when it was a repeat (or failed).
 */
export async function notify(input: NotifyInput): Promise<string | null> {
  try {
    let created;
    try {
      created = await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl ?? null,
          data: input.data != null ? ({ ...input.data, category: input.category } as Prisma.InputJsonValue) : ({ category: input.category } as Prisma.InputJsonValue),
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // already sent
      throw err;
    }

    socketManager.emitToUser(input.userId, 'notification:new', {
      id: created.id,
      type: created.type,
      title: created.title,
      message: created.message,
      actionUrl: created.actionUrl,
      createdAt: created.createdAt,
    });

    const wanted = input.channels ?? [];
    if (wanted.length > 0) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { notificationPreferences: true } });
      const prefs = resolvePreferences(user?.notificationPreferences)[input.category];
      for (const channel of wanted) {
        if (!prefs[channel]) continue;
        if (channel === 'push' && !pushConfigured()) continue;
        if (channel === 'sms' && smsProvider() === 'none') continue;
        await queueDelivery(created.id, channel);
      }
    }
    return created.id;
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'Notification failed');
    return null;
  }
}

/** The same notification to several people (e.g. every kitchen on an order). */
export async function notifyMany(userIds: Iterable<string>, build: (userId: string) => Omit<NotifyInput, 'userId'>) {
  for (const userId of new Set(userIds)) await notify({ userId, ...build(userId) });
}
