import { Router } from 'express';
import {
  registerAsSeller,
  getCurrentSeller,
  updateCurrentSeller,
  getSellerDashboard,
  getSellerAnalytics,
  requestPayout,
  getPayoutHistory,
  toggleStoreLive,
  getPublicSellers,
  getPublicSellerById,
} from '../controllers/seller.controller';
import { authenticate, authorize, blockSuspendedSeller } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { registerSellerSchema, updateSellerSchema, requestPayoutSchema } from '../validators/seller.validator';

const router = Router();

// Public seller discovery routes
router.get('/', getPublicSellers);

// Register as seller (requires authentication)
router.post('/register', authenticate, validate(registerSellerSchema), registerAsSeller);

// Application status & dashboard check (accessible to applicant checking pending/rejected status)
router.get('/me', authenticate, getCurrentSeller);
router.get('/me/dashboard', authenticate, getSellerDashboard);

// Public seller detail route (comes after /me to avoid route conflict)
router.get('/:id', getPublicSellerById);

// All active operational actions require seller role
router.use(authenticate);
router.use(authorize('seller'));
router.use(blockSuspendedSeller);

router.patch('/me', validate(updateSellerSchema), updateCurrentSeller);
router.put('/me', validate(updateSellerSchema), updateCurrentSeller);
router.post('/me/toggle-live', toggleStoreLive);

// Get seller analytics
router.get('/me/analytics', getSellerAnalytics);

// Request payout / list own payout history
router.post('/me/payouts', validate(requestPayoutSchema), requestPayout);
router.get('/me/payouts', getPayoutHistory);

export default router;

