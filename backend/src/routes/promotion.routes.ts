import { Router } from 'express';
import {
  validatePromotionCode,
  getAvailablePromotions,
  getCatalogPromotions,
  listMyPromotions,
  createPromotion,
  getPromotion,
  updatePromotion,
  deletePromotion,
} from '../controllers/promotion.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { promoLimiter } from '../middleware/rateLimiter';
import { validatePromotionCodeSchema, createPromotionSchema, updatePromotionSchema } from '../validators/promotion.validator';

const router = Router();

// Public: promotions per product for customer catalog (no auth)
router.get('/catalog', getCatalogPromotions);

// All other routes require authentication
router.use(authenticate);

// Validate promotion code (any authenticated user)
router.post('/validate', promoLimiter, validate(validatePromotionCodeSchema), validatePromotionCode);

// Get available promotions (any authenticated user)
router.get('/available', getAvailablePromotions);

// Seller-only: list, create, get one, update, delete
router.use(authorize('seller'));
router.get('/', listMyPromotions);
router.get('/:id', getPromotion);
router.post('/', validate(createPromotionSchema), createPromotion);
router.patch('/:id', validate(updatePromotionSchema), updatePromotion);
router.delete('/:id', deletePromotion);

export default router;

