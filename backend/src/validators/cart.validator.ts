import { z } from 'zod';

const optionalHubId = z
  .union([z.string().uuid(), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));

export const addToCartSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'), // UUID or slug; service resolves by id or slug
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  stockType: z.enum(['direct', 'hub', 'both']).optional(),
  hubId: optionalHubId,
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).optional(),
  stockType: z.enum(['direct', 'hub', 'both']).optional(),
  hubId: optionalHubId,
});

