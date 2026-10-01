import { Request, Response } from 'express';
import { getImageUrl, deleteUploadedFile } from '../services/upload.service';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';

/**
 * Upload product images
 * POST /api/v1/upload/product-images
 */
export const uploadProductImages = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Files are already processed by multer middleware
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    throw new AppError('No images uploaded', 400, 'NO_FILES');
  }

  // Generate URLs for all uploaded files
  const uploadedImages = files.map((file, index) => ({
    filename: file.filename,
    url: getImageUrl(file.filename),
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    isPrimary: index === 0,
  }));

  res.status(200).json({
    success: true,
    message: `${files.length} image(s) uploaded successfully`,
    data: {
      images: uploadedImages,
    },
  });
};

/**
 * Delete an uploaded image
 * DELETE /api/v1/upload/product-images/:filename
 */
export const deleteProductImage = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { filename } = req.params;

  if (!filename) {
    throw new AppError('Filename is required', 400, 'FILENAME_REQUIRED');
  }

  // Validate filename to prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    throw new AppError('Invalid filename', 400, 'INVALID_FILENAME');
  }

  // A seller may only delete files they uploaded. Uploads are named
  // "<uploaderId>_<uuid>.<ext>". Older files predate that, so they may be deleted
  // only if attached to one of the caller's own products.
  const isAdmin = req.user.userType === 'admin';
  if (!isAdmin && !filename.startsWith(`${req.user.userId}_`)) {
    const ownLegacy =
      !/^[0-9a-f-]{36}_/i.test(filename) &&
      (await prisma.productImage.count({
        where: {
          imageUrl: { endsWith: `/${filename}` },
          product: { seller: { userId: req.user.userId } },
        },
      })) > 0;
    if (!ownLegacy) {
      throw new AppError('You can only delete your own uploads', 403, 'FORBIDDEN');
    }
  }

  await deleteUploadedFile(filename);

  res.status(200).json({
    success: true,
    message: 'Image deleted successfully',
  });
};

/**
 * Upload payment proof receipt / screenshot
 * POST /api/v1/upload/payment-proof
 */
export const uploadPaymentProof = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const file = req.file as Express.Multer.File;
  if (!file) {
    throw new AppError('No payment proof image uploaded', 400, 'NO_FILE');
  }

  res.status(200).json({
    success: true,
    message: 'Payment proof uploaded successfully',
    data: {
      filename: file.filename,
      url: getImageUrl(file.filename),
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    },
  });
};
