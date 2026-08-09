import { Router } from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
} from '../controllers/product.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getProductsQuerySchema,
  getProductQuerySchema,
  createProductSchema,
  updateProductSchema,
  getSellerProductsQuerySchema,
} from '../validators/product.validator';
import { authenticate, authorize, blockSuspendedSeller, optionalAuthenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', validateQuery(getProductsQuerySchema), getProducts);

// Seller routes - MUST come BEFORE /:identifier to avoid route conflicts
router.get(
  '/seller/my-products',
  authenticate,
  authorize('seller'),
  blockSuspendedSeller,
  validateQuery(getSellerProductsQuerySchema),
  getSellerProducts
);

router.post(
  '/',
  authenticate,
  authorize('seller'),
  blockSuspendedSeller,
  validate(createProductSchema),
  createProduct
);

router.patch(
  '/:id',
  authenticate,
  authorize('seller'),
  blockSuspendedSeller,
  validate(updateProductSchema),
  updateProduct
);

router.delete(
  '/:id',
  authenticate,
  authorize('seller'),
  blockSuspendedSeller,
  deleteProduct
);

// This route must come LAST because /:identifier matches anything
router.get('/:identifier', optionalAuthenticate, validateQuery(getProductQuerySchema), getProduct);

export default router;

