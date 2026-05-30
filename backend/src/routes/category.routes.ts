import { Router } from 'express';
import {
  getCategories,
  getCategoriesByProductType,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { validate } from '../middleware/validation.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../validators/category.validator';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getCategories);
router.get('/grouped', getCategoriesByProductType);  // Get categories grouped by product type
router.get('/:identifier', getCategory);

// Admin routes (requires authentication and admin role)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createCategorySchema),
  createCategory
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(updateCategorySchema),
  updateCategory
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  deleteCategory
);

export default router;

