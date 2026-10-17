import { z } from 'zod';

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      quantity: z.number().int().positive().max(10_000),
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
  promotionCode: z.string().trim().max(50).optional(),
  deliveryInstructions: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const getOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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


export const submitManualPaymentSchema = z.object({
  referenceNumber: z.string().trim().min(1).max(100),
  senderName: z.string().trim().max(120).optional(),
  senderAccount: z.string().trim().max(100).optional(),
  proofUrl: z.string().max(400).optional(),
  notes: z.string().max(500).optional(),
});

export const confirmManualPaymentSchema = z.object({
  confirmed: z.boolean(),
  disputeReason: z.string().max(500).optional(),
});

export const sendOrderMessageSchema = z.object({
  message: z.string().max(2000).optional(),
  role: z.enum(['customer', 'seller', 'rider', 'admin']).optional(),
  messageType: z.enum(['text', 'voice', 'image']).optional(),
  mediaUrl: z.string().max(400).optional(),
  duration: z.number().min(0).max(600).optional(),
});
