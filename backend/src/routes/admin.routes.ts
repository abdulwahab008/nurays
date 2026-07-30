import { Router } from 'express';
import {
  getPendingSellers,
  getAllSellers,
  getSellerById,
  approveRejectSeller,
  updateSellerStatus,
  getProductsForModeration,
  moderateProduct,
  getPayouts,
  completePayout,
  failPayout,
  getSettings,
  updateSettings,
} from '../controllers/admin.controller';
import { adminGetTickets, adminGetTicketDetail, adminReplyToTicket } from '../controllers/support.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  approveRejectSellerSchema,
  moderateProductSchema,
  updateSellerStatusSchema,
  completePayoutSchema,
  failPayoutSchema,
  updateSettingsSchema,
} from '../validators/admin.validator';
import { adminReplySchema } from '../validators/support.validator';

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

// Suspend/reactivate an already-approved seller
router.post('/sellers/:id/status', validate(updateSellerStatusSchema), updateSellerStatus);

// List products for moderation
router.get('/products', getProductsForModeration);

// Moderate product
router.post('/products/:id/moderate', validate(moderateProductSchema), moderateProduct);

// List / complete / fail seller payout requests
router.get('/payouts', getPayouts);
router.post('/payouts/:id/complete', validate(completePayoutSchema), completePayout);
router.post('/payouts/:id/fail', validate(failPayoutSchema), failPayout);

// Platform settings
router.get('/settings', getSettings);
router.patch('/settings', validate(updateSettingsSchema), updateSettings);

// Support tickets
router.get('/support/tickets', adminGetTickets);
router.get('/support/tickets/:id', adminGetTicketDetail);
router.post('/support/tickets/:id/reply', validate(adminReplySchema), adminReplyToTicket);

export default router;

