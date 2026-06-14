import { Router } from 'express';
import {
  getProducts,
  getProduct,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
} from '../controllers/product.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  getSellerProductsQuerySchema,
} from '../validators/product.validator';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', validateQuery(getProductsQuerySchema), getProducts);

// Seller routes - MUST come BEFORE /:identifier to avoid route conflicts
router.get(
  '/seller/my-products',
  authenticate,
  authorize('seller'),
  validateQuery(getSellerProductsQuerySchema),
  getSellerProducts
);

router.post(
  '/',
  authenticate,
  authorize('seller'),
  validate(createProductSchema),
  createProduct
);

router.patch(
  '/:id',
  authenticate,
  authorize('seller'),
  validate(updateProductSchema),
  updateProduct
);

router.delete(
  '/:id',
  authenticate,
  authorize('seller'),
  deleteProduct
);

// Related / "you may also like" for a product (public)
router.get('/:id/related', getRelatedProducts);

// This route must come LAST because /:identifier matches anything
router.get('/:identifier', getProduct);

export default router;

