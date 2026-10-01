/**
 * Links to files WE stored (uploads are served from /uploads/...). User-supplied media and proof
 * links must be one of these: an external or protocol-relative URL ("//evil.com/x") in a chat
 * message or payment proof is a tracking / phishing link rendered in the other party's browser.
 */
export const isOwnUploadPath = (value: string): boolean =>
  value.length <= 300 && /^\/uploads\/[A-Za-z0-9._\-/]+$/.test(value) && !value.includes('..');

/** An uploaded product image path belonging to the given user ("/uploads/products/<userId>_<uuid>.<ext>"). */
export const isUploadedBy = (url: string, userId: string): boolean =>
  isOwnUploadPath(url) && url.startsWith(`/uploads/products/${userId}_`);
