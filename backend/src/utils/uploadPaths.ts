import { isStoredFile, storedFileOwner } from '../storage';

/**
 * Links to files WE stored. User-supplied media and proof links must be one of these: an
 * external or protocol-relative URL ("//evil.com/x") in a chat message or payment proof is a
 * tracking / phishing link rendered in the other party's browser. See storage/index.ts.
 */
export const isOwnUploadPath = (value: string): boolean => isStoredFile(value);

/** A product image this user uploaded. */
export const isUploadedBy = (url: string, userId: string): boolean =>
  isStoredFile(url, { public: 'products' }) && storedFileOwner(url) === userId;
