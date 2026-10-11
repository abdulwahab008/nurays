import { Router } from 'express';
import { authenticate, blockSuspendedSeller } from '../middleware/auth.middleware';
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

// The writes change a kitchen's own menu (price, stock), so a suspended kitchen is turned away, as it is on the product routes.
// Anyone who is not a kitchen passes this and meets the ownership check in the service.

// Create single variant
router.post('/', blockSuspendedSeller, validate(createProductVariantSchema), productVariantController.createVariant);

// Bulk create variants
router.post('/bulk', blockSuspendedSeller, validate(bulkCreateVariantsSchema), productVariantController.bulkCreateVariants);

// Get all variants for a product
router.get('/product/:productId', productVariantController.getProductVariants);

// Get single variant
router.get('/:variantId', productVariantController.getVariant);

// Update variant
router.patch('/:variantId', blockSuspendedSeller, validate(updateProductVariantSchema), productVariantController.updateVariant);

// Delete variant
router.delete('/:variantId', blockSuspendedSeller, productVariantController.deleteVariant);

export default router;
