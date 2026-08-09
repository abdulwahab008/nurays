import { z } from 'zod';

export const getSellerOrdersQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
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
}).refine((data) => data.status !== 'delivery_failed' || !!data.reason, {
  message: 'A reason is required when reporting a failed delivery',
  path: ['reason'],
});

export const cancelOrderItemSchema = z.object({
  reason: z.string().min(5).max(500),
});

