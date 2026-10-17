import multer from 'multer';
import path from 'path';
import type { RequestHandler } from 'express';
import { AppError } from '../middleware/errorHandler';

/**
 * Upload parsing. Files are held in memory only long enough to be validated and
 * re-encoded (media.service.ts) and written to storage (../storage): nothing the
 * client sends is written to disk as-is.
 */
const memory = multer.memoryStorage();

/** Product / avatar photos: up to 4 at once, 8 MB each (they are resized before storing). */
export const imageUpload = multer({ storage: memory, limits: { fileSize: 8 * 1024 * 1024, files: 4 } });

/** A payment receipt, chat photo or voice note: one file, 5 MB. */
export const singleFileUpload = multer({ storage: memory, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/** A seller / rider document (photo or PDF): one file, 10 MB. */
export const documentUpload = multer({ storage: memory, limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/**
 * A body multer cannot read (no boundary, cut short, a mangled part header) comes back from it as a plain Error, which the
 * error handler would answer with a 500. It is the sender's body that is wrong: a 400. Size and count limits keep their own
 * answers (MulterError).
 */
export const asBadUpload = (handler: RequestHandler): RequestHandler => (req, res, next) =>
  handler(req, res, (err?: unknown) => {
    if (!err || err instanceof AppError || (err as { name?: string }).name === 'MulterError') return next(err);
    next(new AppError('The upload could not be read', 400, 'INVALID_UPLOAD'));
  });

export const uploadProductImageFiles = asBadUpload(imageUpload.array('images', 4));
export const uploadAvatarFile = asBadUpload(imageUpload.single('avatar'));
export const uploadCoverFile = asBadUpload(imageUpload.single('cover'));
export const uploadProofFile = asBadUpload(singleFileUpload.single('proof'));
export const uploadChatFile = asBadUpload(singleFileUpload.single('file'));
export const uploadDocumentFile = asBadUpload(documentUpload.single('file'));

/**
 * Files uploaded before the storage layer existed live under <uploads>/products and are
 * still served from /uploads/products for the URLs already saved in the database.
 */
export const legacyUploadsDir = path.join(
  path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')),
  'products'
);
