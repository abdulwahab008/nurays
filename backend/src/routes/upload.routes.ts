import { Router } from 'express';
import {
  uploadProductImages,
  deleteProductImage,
  uploadPaymentProof,
  uploadChatMedia,
  uploadDocument,
  uploadAvatar,
  uploadCover,
} from '../controllers/upload.controller';
import {
  uploadProductImageFiles,
  uploadAvatarFile,
  uploadCoverFile,
  uploadProofFile,
  uploadChatFile,
  uploadDocumentFile,
} from '../services/upload.service';
import { rejectUnsafeText } from '../middleware/unsafeText';
import { authenticate, authorize, blockSuspendedSeller } from '../middleware/auth.middleware';
import { auditWrites } from '../middleware/audit';
import { ifStaffRequire } from '../middleware/staff';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// Product images (up to 4), sellers only
router.post('/product-images', authorize('seller'), blockSuspendedSeller, uploadLimiter, uploadProductImageFiles, rejectUnsafeText, uploadProductImages);
router.delete('/product-images', authorize('seller', 'admin'), blockSuspendedSeller, ifStaffRequire('ops.write'), auditWrites('admin', { onlyAdmins: true }), deleteProductImage);
router.delete('/product-images/:filename', authorize('seller', 'admin'), blockSuspendedSeller, ifStaffRequire('ops.write'), auditWrites('admin', { onlyAdmins: true }), deleteProductImage);

// Payment receipt (customers paying by transfer)
router.post('/payment-proof', uploadLimiter, uploadProofFile, rejectUnsafeText, uploadPaymentProof);

// Chat photo / voice note
router.post('/chat-media', uploadLimiter, uploadChatFile, rejectUnsafeText, uploadChatMedia);

// Verification documents (sellers, riders)
router.post('/documents', uploadLimiter, uploadDocumentFile, rejectUnsafeText, uploadDocument);

// Profile photo
router.post('/avatar', uploadLimiter, uploadAvatarFile, rejectUnsafeText, uploadAvatar);

// Storefront cover photo (sellers and people applying to sell)
router.post('/cover', uploadLimiter, uploadCoverFile, rejectUnsafeText, uploadCover);

export default router;
