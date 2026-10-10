import { z } from 'zod';

export const getSellerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['pending', 'preparing', 'ready', 'dispatched', 'cancelled']).optional(),
  orderStatus: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'dispatched',
    'in_transit',
    'delivered',
    'completed',
    'cancelled',
  ]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const updateOrderItemStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'delivery_failed', 'cancelled']),
  reason: z.string().min(1).max(500).optional(),
  // The customer's handover code, required to mark a self-delivery / pickup as delivered.
  handoverCode: z.string().trim().regex(/^\d{4}$/, 'The handover code is 4 digits').optional(),
}).refine((data) => data.status !== 'delivery_failed' || !!data.reason, {
  message: 'A reason is required when reporting a failed delivery',
  path: ['reason'],
});

export const cancelOrderItemSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const deliverOrderSchema = z.object({
  handoverCode: z.string().trim().regex(/^\d{4}$/, 'The handover code is 4 digits'),
});

export const deliveryFailedSchema = z.object({
  reason: z.string().trim().min(3, 'Say why the delivery failed').max(500),
});

export const rejectOrderSchema = z.object({ reason: z.string().trim().max(500).optional() });
