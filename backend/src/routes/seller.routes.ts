import { Router } from 'express';
import {
  registerAsSeller,
  getCurrentSeller,
  updateCurrentSeller,
  getSellerDashboard,
  getSellerAnalytics,
  requestPayout,
} from '../controllers/seller.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { registerSellerSchema, updateSellerSchema, requestPayoutSchema } from '../validators/seller.validator';

const router = Router();

// Register as seller (requires authentication)
router.post('/register', authenticate, validate(registerSellerSchema), registerAsSeller);

// All other routes require seller role
router.use(authenticate);
router.use(authorize('seller'));

// Get / update current seller profile (must be before /me/dashboard so /me matches first)
router.get('/me', getCurrentSeller);
router.patch('/me', validate(updateSellerSchema), updateCurrentSeller);

// Get seller dashboard
router.get('/me/dashboard', getSellerDashboard);

// Get seller analytics
router.get('/me/analytics', getSellerAnalytics);

// Request payout
router.post('/me/payouts', validate(requestPayoutSchema), requestPayout);

export default router;

