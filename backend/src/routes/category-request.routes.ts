import { Router } from 'express';
import {
  createCategoryRequest,
  getMyRequests,
  getAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  getPendingCount,
} from '../controllers/category-request.controller';
import { authenticate, authorize, requireSeller } from '../middleware/auth.middleware';
import { auditWrites } from '../middleware/audit';
import { requirePermission } from '../middleware/staff';
import { validate } from '../middleware/validation.middleware';
import { createCategoryRequestSchema, rejectCategoryRequestSchema } from '../validators/category-request.validator';

const router = Router();

// Seller routes
router.post(
  '/',
  authenticate,
  requireSeller,
  validate(createCategoryRequestSchema),
  createCategoryRequest
);

router.get(
  '/my-requests',
  authenticate,
  requireSeller,
  getMyRequests
);

// Admin routes
router.get(
  '/',
  authenticate,
  authorize('admin'),
  requirePermission('read.approvals'),
  auditWrites('admin'),
  getAllRequests
);

router.get(
  '/pending-count',
  authenticate,
  authorize('admin'),
  requirePermission('read.approvals'),
  auditWrites('admin'),
  getPendingCount
);

router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  requirePermission('read.approvals'),
  auditWrites('admin'),
  getRequestById
);

router.post(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  requirePermission('ops.write'),
  auditWrites('admin'),
  approveRequest
);

router.post(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  requirePermission('ops.write'),
  auditWrites('admin'),
  validate(rejectCategoryRequestSchema),
  rejectRequest
);

export default router;
