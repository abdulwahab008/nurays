import { z } from 'zod';

export const addReviewSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  orderItemId: z.string().uuid('Invalid order item ID'),
  productRating: z.number().min(1).max(5),
  sellerRating: z.number().min(1).max(5),
  deliveryRating: z.number().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
  photos: z.array(z.string().url('Invalid photo URL')).optional(),
});

export const getProductReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});


/** Why someone reports a review. The words staff see are in the moderation service. */
export const REVIEW_REPORT_REASONS = ['abusive', 'spam', 'false', 'privacy', 'other'] as const;

export const reportReviewSchema = z.object({
  reason: z.enum(REVIEW_REPORT_REASONS),
  note: z.string().trim().max(300).optional(),
});

/** Staff: the reviews waiting for a decision (reported), the ones they hid, or everything. */
export const REVIEW_QUEUES = ['reported', 'hidden', 'all'] as const;

export const staffReviewsQuerySchema = z.object({
  status: z.enum(REVIEW_QUEUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
