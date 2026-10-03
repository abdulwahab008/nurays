import { z } from 'zod';

const channels = z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean() }).partial();

export const preferencesSchema = z.object({
  preferences: z.object({ orders: channels, payments: channels, deliveries: channels }).partial(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });
