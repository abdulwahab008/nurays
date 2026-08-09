import { z } from 'zod';

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['picked_up', 'in_transit', 'delivered', 'delivery_failed']),
  reason: z.string().min(1).max(500).optional(),
}).refine((data) => data.status !== 'delivery_failed' || !!data.reason, {
  message: 'A reason is required when reporting a failed delivery',
  path: ['reason'],
});
