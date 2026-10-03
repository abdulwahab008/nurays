import multer from 'multer';
import path from 'path';

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
 * Files uploaded before the storage layer existed live under <uploads>/products and are
 * still served from /uploads/products for the URLs already saved in the database.
 */
export const legacyUploadsDir = path.join(
  path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')),
  'products'
);
