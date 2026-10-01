import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
const productImagesDir = path.join(uploadsDir, 'products');

// Ensure directories exist
[uploadsDir, productImagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, productImagesDir);
  },
  filename: (req, file, cb) => {
    // The extension comes from the validated mimetype, never from the client's
    // filename: otherwise "evil.html" uploaded as image/png would be stored and
    // later served as HTML from our origin. The uploader's id is part of the
    // name so ownership can be checked on delete (payment proofs share this dir).
    const ext = MIME_EXTENSIONS[file.mimetype] || '.bin';
    const owner = ((req as any).user?.userId as string | undefined) || 'anon';
    cb(null, `${owner}_${crypto.randomUUID()}${ext}`);
  },
});

// File filter for images only
const imageFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files (JPEG, PNG, WebP, GIF) are allowed', 400, 'INVALID_FILE_TYPE'));
  }
};

// Multer upload configuration
export const uploadProductImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 4, // Max 4 files at once
  },
});

// Helper to get the public URL for an uploaded file
export const getImageUrl = (filename: string): string => {
  return `/uploads/products/${filename}`;
};

// Helper to delete an uploaded file
export const deleteUploadedFile = async (filename: string): Promise<void> => {
  const filePath = path.join(productImagesDir, filename);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to delete file:', error);
  }
};

// Export paths for static file serving
export const uploadsPaths = {
  root: uploadsDir,
  products: productImagesDir,
};

export default {
  uploadProductImages,
  getImageUrl,
  deleteUploadedFile,
  uploadsPaths,
};
