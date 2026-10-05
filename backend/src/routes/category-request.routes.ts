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

const router = Router();

// Seller routes
router.post(
  '/',
  authenticate,
  requireSeller,
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
  auditWrites('admin'),
  getAllRequests
);

router.get(
  '/pending-count',
  authenticate,
  authorize('admin'),
  auditWrites('admin'),
  getPendingCount
);

router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  auditWrites('admin'),
  getRequestById
);

router.post(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  auditWrites('admin'),
  approveRequest
);

router.post(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  auditWrites('admin'),
  rejectRequest
);

export default router;
