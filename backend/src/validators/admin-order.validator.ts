import { z } from 'zod';

export const getAdminOrdersQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
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
    'refunded',
  ]).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  customerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  orderNumber: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'dispatched',
    'in_transit',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
  ]),
  notes: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const processRefundSchema = z.object({
  refundAmount: z.number().positive().optional(),
});

export const getAnalyticsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

