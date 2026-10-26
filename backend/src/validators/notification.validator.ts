import { z } from 'zod';

const channels = z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean() }).partial();

export const preferencesSchema = z.object({
  preferences: z.object({ orders: channels, payments: channels, deliveries: channels }).partial(),
});

// A store app's device token: FCM's (about 160 characters, letters, digits and -_:) or APNs' (64 hex digits).
const deviceToken = z.string().trim().min(32, 'Device token is too short').max(4096).regex(/^[A-Za-z0-9_:.-]+$/, 'Device token has characters no token has');

export const pushSubscriptionSchema = z.union([
  z.object({
    platform: z.literal('web').optional(),
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  }),
  z.object({ platform: z.enum(['android', 'ios']), token: deviceToken }),
]);

/** A browser names its subscription by its endpoint, a store app by its device token. */
export const pushUnsubscribeSchema = z.union([z.object({ endpoint: z.string().url().max(1000) }), z.object({ token: deviceToken })]);
