import { z } from 'zod';

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      quantity: z.number().int().positive(),
      stockType: z.enum(['direct', 'hub', 'both']).optional(),
      hubId: z.string().uuid().optional(),
    })
  ).min(1, 'At least one item is required'),
  deliveryType: z.enum(['home_delivery', 'hub_pickup', 'self_pickup']),
  deliveryAddressId: z.string().uuid().optional(),
  hubId: z.string().uuid().optional(),
  deliverySlotDate: z.string().optional(),
  deliverySlotTime: z.string().optional(),
  paymentMethod: z.enum(['jazzcash', 'easypaisa', 'bank', 'cod', 'wallet', 'card', 'safepay']),
  promotionCode: z.string().optional(),
  deliveryInstructions: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const getOrdersQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
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
  ]).optional(),
});

