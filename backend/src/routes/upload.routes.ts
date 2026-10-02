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
import { imageUpload, singleFileUpload, documentUpload } from '../services/upload.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// Product images (up to 4), sellers only
router.post('/product-images', authorize('seller'), uploadLimiter, imageUpload.array('images', 4), uploadProductImages);
router.delete('/product-images', authorize('seller', 'admin'), deleteProductImage);
router.delete('/product-images/:filename', authorize('seller', 'admin'), deleteProductImage);

// Payment receipt (customers paying by transfer)
router.post('/payment-proof', uploadLimiter, singleFileUpload.single('proof'), uploadPaymentProof);

// Chat photo / voice note
router.post('/chat-media', uploadLimiter, singleFileUpload.single('file'), uploadChatMedia);

// Verification documents (sellers, riders)
router.post('/documents', uploadLimiter, documentUpload.single('file'), uploadDocument);

// Profile photo
router.post('/avatar', uploadLimiter, imageUpload.single('avatar'), uploadAvatar);

// Storefront cover photo (sellers and people applying to sell)
router.post('/cover', uploadLimiter, imageUpload.single('cover'), uploadCover);

export default router;
