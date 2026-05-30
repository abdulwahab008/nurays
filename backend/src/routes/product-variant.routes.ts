import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import * as productVariantController from '../controllers/product-variant.controller';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
  bulkCreateVariantsSchema,
} from '../validators/product-variant.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create single variant
router.post('/', validate(createProductVariantSchema), productVariantController.createVariant);

// Bulk create variants
router.post('/bulk', validate(bulkCreateVariantsSchema), productVariantController.bulkCreateVariants);

// Get all variants for a product
router.get('/product/:productId', productVariantController.getProductVariants);

// Get single variant
router.get('/:variantId', productVariantController.getVariant);

// Update variant
router.patch('/:variantId', validate(updateProductVariantSchema), productVariantController.updateVariant);

// Delete variant
router.delete('/:variantId', productVariantController.deleteVariant);

export default router;
