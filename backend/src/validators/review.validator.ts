import { z } from 'zod';

export const addReviewSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  orderItemId: z.string().uuid('Invalid order item ID'),
  productRating: z.number().min(1).max(5),
  sellerRating: z.number().min(1).max(5),
  deliveryRating: z.number().min(1).max(5).optional(),
  comment: z.string().optional(),
  photos: z.array(z.string().url('Invalid photo URL')).optional(),
});

export const getProductReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

