import { z } from 'zod';

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['picked_up', 'in_transit', 'delivered']),
});
