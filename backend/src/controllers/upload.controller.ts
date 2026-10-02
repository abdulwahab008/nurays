import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';
import { legacyUploadsDir } from '../services/upload.service';
import {
  storePublicImage,
  deletePublicImage,
  storePrivateImage,
  storePrivateAudio,
  storePrivatePdf,
} from '../services/media.service';
import { storedFileOwner } from '../storage';

const requireUser = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user;
};

/**
 * Upload product images (stored in three sizes)
 * POST /api/v1/upload/product-images
 */
export const uploadProductImages = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) throw new AppError('No images uploaded', 400, 'NO_FILES');

  const images = [];
  for (const [index, file] of files.entries()) {
    const stored = await storePublicImage('products', user.userId, file.buffer);
    images.push({ ...stored, originalName: file.originalname, size: file.size, isPrimary: index === 0 });
  }

  res.status(200).json({
    success: true,
    message: `${images.length} image(s) uploaded successfully`,
    data: { images },
  });
};

/**
 * Delete an uploaded product image
 * DELETE /api/v1/upload/product-images?url=<image url>
 * DELETE /api/v1/upload/product-images/:filename   (files uploaded before the storage layer)
 */
export const deleteProductImage = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const isAdmin = user.userType === 'admin';
  const url = typeof req.query.url === 'string' ? req.query.url : typeof req.body?.url === 'string' ? req.body.url : null;

  if (url) {
    if (!isAdmin && storedFileOwner(url) !== user.userId) {
      throw new AppError('You can only delete your own uploads', 403, 'FORBIDDEN');
    }
    const inUse = await prisma.productImage.count({ where: { imageUrl: url } });
    if (inUse > 0) throw new AppError('This image is still used by a product', 409, 'IMAGE_IN_USE');
    if (!(await deletePublicImage(url))) throw new AppError('Not an uploaded image', 400, 'INVALID_IMAGE_URL');
    res.status(200).json({ success: true, message: 'Image deleted successfully' });
    return;
  }

  const { filename } = req.params;
  if (!filename || filename.includes('..') || filename.includes('/') || !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new AppError('Invalid filename', 400, 'INVALID_FILENAME');
  }
  // Legacy uploads are named "<uploaderId>_<uuid>.<ext>"; older ones may be deleted only
  // if attached to one of the caller's own products.
  if (!isAdmin && !filename.startsWith(`${user.userId}_`)) {
    const ownLegacy =
      !/^[0-9a-f-]{36}_/i.test(filename) &&
      (await prisma.productImage.count({
        where: { imageUrl: { endsWith: `/${filename}` }, product: { seller: { userId: user.userId } } },
      })) > 0;
    if (!ownLegacy) throw new AppError('You can only delete your own uploads', 403, 'FORBIDDEN');
  }
  await fs.promises.rm(path.join(legacyUploadsDir, filename), { force: true });
  res.status(200).json({ success: true, message: 'Image deleted successfully' });
};

/**
 * Upload a payment receipt. Stored privately: only the order's customer, its kitchen
 * and admins ever get a (short-lived) link to it.
 * POST /api/v1/upload/payment-proof
 */
export const uploadPaymentProof = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;
  if (!file) throw new AppError('No payment proof image uploaded', 400, 'NO_FILE');
  const stored = await storePrivateImage('proofs', user.userId, file.buffer);
  res.status(200).json({
    success: true,
    message: 'Payment proof uploaded successfully',
    // `url` is what the client sends back with the payment; it is a private reference.
    data: { url: stored.ref, ref: stored.ref, previewUrl: stored.previewUrl, size: file.size, mimetype: stored.contentType },
  });
};

/**
 * Upload a chat photo or voice note (private to the order's participants).
 * POST /api/v1/upload/chat-media
 */
export const uploadChatMedia = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const isImage = file.mimetype.startsWith('image/');
  const stored = isImage
    ? await storePrivateImage('chat', user.userId, file.buffer)
    : await storePrivateAudio('chat', user.userId, file.buffer);
  res.status(200).json({
    success: true,
    data: { url: stored.ref, ref: stored.ref, previewUrl: stored.previewUrl, mediaType: isImage ? 'image' : 'voice' },
  });
};

/**
 * Upload a verification document (CNIC, licence, kitchen photo): private, admins only.
 * POST /api/v1/upload/documents
 */
export const uploadDocument = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const stored =
    file.mimetype === 'application/pdf'
      ? await storePrivatePdf('docs', user.userId, file.buffer)
      : await storePrivateImage('docs', user.userId, file.buffer);
  res.status(200).json({ success: true, data: { url: stored.ref, ref: stored.ref, previewUrl: stored.previewUrl } });
};

/**
 * Upload a profile photo (public, resized).
 * POST /api/v1/upload/avatar
 */
export const uploadAvatar = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;
  if (!file) throw new AppError('No image uploaded', 400, 'NO_FILE');
  const stored = await storePublicImage('avatars', user.userId, file.buffer);
  res.status(200).json({ success: true, data: stored });
};

/**
 * Upload a storefront cover photo (public, resized). Anyone applying to sell can upload one.
 * POST /api/v1/upload/cover
 */
export const uploadCover = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const file = req.file;
  if (!file) throw new AppError('No image uploaded', 400, 'NO_FILE');
  const stored = await storePublicImage('covers', user.userId, file.buffer);
  res.status(200).json({ success: true, data: stored });
};
