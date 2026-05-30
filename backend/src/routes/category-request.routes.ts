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
  getAllRequests
);

router.get(
  '/pending-count',
  authenticate,
  authorize('admin'),
  getPendingCount
);

router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  getRequestById
);

router.post(
  '/:id/approve',
  authenticate,
  authorize('admin'),
  approveRequest
);

router.post(
  '/:id/reject',
  authenticate,
  authorize('admin'),
  rejectRequest
);

export default router;
