import { Router } from 'express';
import { addReview, getProductReviews, reportReview } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validation.middleware';
import { addReviewSchema, getProductReviewsQuerySchema, reportReviewSchema } from '../validators/review.validator';
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

// Report a review (anyone signed in but its author): it goes to the staff queue, it is not hidden by the report
router.post('/:id/report', authenticate, submissionLimiter, validate(reportReviewSchema), reportReview);

export default router;

