import { Router } from 'express';
import { uploadProductImages, deleteProductImage } from '../controllers/upload.controller';
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

export default router;
