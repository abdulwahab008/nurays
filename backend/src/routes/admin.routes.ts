import { Router } from 'express';
import {
  getPendingSellers,
  getAllSellers,
  getSellerById,
  approveRejectSeller,
  moderateProduct,
} from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { approveRejectSellerSchema, moderateProductSchema } from '../validators/admin.validator';

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Get pending sellers
router.get('/pending-sellers', getPendingSellers);

// Get all sellers
router.get('/sellers', getAllSellers);
// Get one seller by ID (must be after /sellers)
router.get('/sellers/:id', getSellerById);

// Approve/reject seller
router.post('/sellers/:id/approve', validate(approveRejectSellerSchema), approveRejectSeller);
router.post('/sellers/:id/reject', validate(approveRejectSellerSchema), approveRejectSeller);

// Moderate product
router.post('/products/:id/moderate', validate(moderateProductSchema), moderateProduct);

export default router;

