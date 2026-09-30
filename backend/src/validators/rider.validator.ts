import { z } from 'zod';

export const updateDeliveryStatusSchema = z.object({
  status: z.enum([
    'arrived_at_pickup',
    'picked_up',
    'in_transit',
    'arrived_at_customer',
    'delivered',
    'delivery_failed',
  ]),
  reason: z.string().min(1).max(500).optional(),
  otp: z.string().length(4).regex(/^\d{4}$/, 'OTP must be a 4-digit code').optional(),
}).refine((data) => data.status !== 'delivery_failed' || !!data.reason, {
  message: 'A reason is required when reporting a failed delivery',
  path: ['reason'],
});

