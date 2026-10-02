import { Router } from 'express';
import { addReview, getProductReviews } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validation.middleware';
import { addReviewSchema, getProductReviewsQuerySchema } from '../validators/review.validator';
import { submissionLimiter } from '../middleware/rateLimiter';

const router = Router();

// Get product reviews (public)
router.get(
  '/products/:id/reviews',
  validateQuery(getProductReviewsQuerySchema),
  getProductReviews
);

// Add review (requires authentication)
router.post('/', authenticate, submissionLimiter, validate(addReviewSchema), addReview);

export default router;

