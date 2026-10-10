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
import { auditWrites } from '../middleware/audit';
import { requirePermission } from '../middleware/staff';

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
  requirePermission('ops.write'),
  auditWrites('admin'),
  validate(createCategorySchema),
  createCategory
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  requirePermission('ops.write'),
  auditWrites('admin'),
  validate(updateCategorySchema),
  updateCategory
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  requirePermission('ops.write'),
  auditWrites('admin'),
  deleteCategory
);

export default router;

