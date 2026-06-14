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
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled', 'rejected']),
});

export const cancelOrderItemSchema = z.object({
  reason: z.string().min(5).max(500),
});

