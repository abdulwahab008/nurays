import { Router } from 'express';
import { uploadProductImages, deleteProductImage, uploadPaymentProof } from '../controllers/upload.controller';
import { uploadProductImages as multerUpload } from '../services/upload.service';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Upload product images (up to 4 images)
router.post(
  '/product-images',
  authenticate,
  authorize('seller'),
  multerUpload.array('images', 4),
  uploadProductImages
);

// Delete a product image
router.delete(
  '/product-images/:filename',
  authenticate,
  authorize('seller'),
  deleteProductImage
);

// Upload payment proof receipt / screenshot (accessible to buyers and sellers)
router.post(
  '/payment-proof',
  authenticate,
  multerUpload.single('proof'),
  uploadPaymentProof
);

export default router;
