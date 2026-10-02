import crypto from 'crypto';
import path from 'path';
import { LocalStorage } from './local.driver';
import { S3Storage } from './s3.driver';
import type { StorageDriver } from './types';

/**
 * Where uploaded files live.
 *
 *  STORAGE_DRIVER=local (default): this server's disk under UPLOADS_DIR. Fine for
 *    development, or one server with a persistent, backed-up volume.
 *  STORAGE_DRIVER=s3: any S3-compatible store (AWS S3, Cloudflare R2, MinIO...).
 *
 * Two kinds of object:
 *  - public  (key "p/..."): product images, avatars. Served from ASSET_BASE_URL
 *    (a CDN) with immutable cache headers. The database stores their URL.
 *  - private (key "x/..."): payment receipts, seller / rider documents, chat
 *    media. Never publicly readable. The database stores "private:<key>" and an
 *    API that has checked the viewer may see it turns that into a link valid for
 *    a few minutes (presentFile).
 */

export const PRIVATE_PREFIX = 'private:';
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

const trimSlash = (s: string) => s.replace(/\/+$/, '');

function build(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  const assetBase = trimSlash(process.env.ASSET_BASE_URL || '');
  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET');
    if (!assetBase) throw new Error('STORAGE_DRIVER=s3 needs ASSET_BASE_URL (the CDN / public URL of the bucket)');
    return new S3Storage({
      bucket,
      privateBucket: process.env.S3_PRIVATE_BUCKET || bucket,
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      assetBaseUrl: assetBase,
    });
  }
  const root = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
  const secret =
    process.env.FILE_URL_SECRET ||
    crypto.createHash('sha256').update(`nuray-files:${process.env.JWT_SECRET ?? ''}`).digest('hex');
  return new LocalStorage(root, assetBase, secret);
}

let instance: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!instance) instance = build();
  return instance;
}
/** Tests switch drivers by changing env and calling this. */
export function resetStorage(): void {
  instance = null;
}

export type PublicKind = 'products' | 'avatars' | 'covers';
export type PrivateKind = 'proofs' | 'chat' | 'docs';
export type ImageSize = 'lg' | 'md' | 'sm';

export function newPublicKey(kind: PublicKind, ownerId: string, size: ImageSize, id: string): string {
  return `p/${kind}/${ownerId}/${id}-${size}.webp`;
}

export function newPrivateKey(kind: PrivateKind, ownerId: string, ext: string): string {
  return `x/${kind}/${ownerId}/${crypto.randomUUID()}.${ext}`;
}

export const isPrivateRef = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PRIVATE_PREFIX);
export const privateRef = (key: string) => `${PRIVATE_PREFIX}${key}`;
export const keyOfPrivateRef = (ref: string) => ref.slice(PRIVATE_PREFIX.length);

const KEY_RE = /^[a-z]\/[a-z]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
const safeKey = (key: string) => key.length <= 300 && KEY_RE.test(key) && !key.includes('..');

/** The storage key of a public object we stored, from its URL (null if it isn't one). */
export function publicKeyFromUrl(url: string): string | null {
  const assetBase = trimSlash(process.env.ASSET_BASE_URL || '');
  const candidates = [`${assetBase}/media/`, `${assetBase}/`, '/media/'];
  for (const prefix of candidates) {
    if (prefix !== '/' && url.startsWith(prefix)) {
      const key = url.slice(prefix.length);
      if (key.startsWith('p/') && safeKey(key)) return key;
    }
  }
  return null;
}

/** Legacy uploads (before the storage layer) were served from /uploads/products/<owner>_<uuid>.<ext>. */
const LEGACY_RE = /^\/uploads\/[A-Za-z0-9._\-/]+$/;

/**
 * Is this a file we stored? User-supplied media / proof / image links must be:
 * an external or protocol-relative URL in a chat message or payment proof would be
 * a tracking or phishing link rendered in someone else's browser.
 */
export function isStoredFile(value: unknown, kind?: { private?: PrivateKind; public?: PublicKind }): boolean {
  if (typeof value !== 'string' || value.length > 400 || value.includes('..')) return false;
  if (isPrivateRef(value)) {
    const key = keyOfPrivateRef(value);
    return safeKey(key) && key.startsWith('x/') && (!kind?.private || key.startsWith(`x/${kind.private}/`));
  }
  if (kind?.private) return LEGACY_RE.test(value); // legacy proofs / media were public files
  const key = publicKeyFromUrl(value);
  if (key) return !kind?.public || key.startsWith(`p/${kind.public}/`);
  return LEGACY_RE.test(value);
}

/** Who uploaded a stored file (the owner id in its key), or null for files that don't record it. */
export function storedFileOwner(value: string): string | null {
  const key = isPrivateRef(value) ? keyOfPrivateRef(value) : publicKeyFromUrl(value);
  if (key) return key.split('/')[2] ?? null;
  const legacy = value.match(/^\/uploads\/products\/([A-Za-z0-9-]+)_[A-Za-z0-9-]+\.[a-z0-9]+$/i);
  return legacy ? legacy[1] : null;
}

/** A link the (already authorised) viewer can open: private refs become short-lived signed links. */
export async function presentFile(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isPrivateRef(value)) return value;
  const key = keyOfPrivateRef(value);
  if (!safeKey(key)) return null;
  return storage().signedUrl(key, SIGNED_URL_TTL_SECONDS);
}

export type { StorageDriver, Visibility } from './types';
export { LocalStorage } from './local.driver';
