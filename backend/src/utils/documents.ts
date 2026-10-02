import { AppError } from '../middleware/errorHandler';
import { isPrivateRef, isStoredFile, storedFileOwner, PublicKind } from '../storage';

/**
 * A verification document (CNIC, licence, kitchen photo) this user uploaded through
 * POST /upload/documents: a private file of theirs, never a link from elsewhere.
 */
export function assertOwnDocument(value: unknown, userId: string, what: string): string {
  if (typeof value !== 'string' || !isPrivateRef(value) || !isStoredFile(value, { private: 'docs' }) || storedFileOwner(value) !== userId) {
    throw new AppError(`Please upload the ${what} again.`, 400, 'INVALID_DOCUMENT');
  }
  return value;
}

/** A public image (e.g. a storefront cover) this user uploaded here. */
export function assertOwnPublicImage(value: unknown, userId: string, kind: PublicKind, what: string): string {
  if (typeof value !== 'string' || !isStoredFile(value, { public: kind }) || storedFileOwner(value) !== userId) {
    throw new AppError(`Please upload the ${what} again.`, 400, 'INVALID_IMAGE');
  }
  return value;
}
