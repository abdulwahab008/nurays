import { z } from 'zod';

export const getAdminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  orderStatus: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'dispatched',
    'in_transit',
    'delivered',
    'delivery_failed',
    'completed',
    'cancelled',
    'refunded',
  ]).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded', 'refund_pending', 'payment_submitted', 'disputed']).optional(),
  customerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  dateFrom: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid dateFrom').optional(),
  dateTo: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid dateTo').optional(),
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
  // Why the refund is given; kept on the refund and in the audit log.
  reason: z.string().trim().min(3).max(300).optional(),
});

export const completeRefundSchema = z.object({
  reference: z.string().max(255).optional(),
});

export const dismissRefundSchema = z.object({
  reason: z.string().trim().min(5, 'Say why the refund is not owed').max(500),
});

export const listRefundsQuerySchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
});

export const getAnalyticsQuerySchema = z.object({
  dateFrom: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid dateFrom').optional(),
  dateTo: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid dateTo').optional(),
});


export const confirmTransferSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
