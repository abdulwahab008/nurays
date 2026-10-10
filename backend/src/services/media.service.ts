import crypto from 'crypto';
import sharp from 'sharp';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  storage,
  newPublicKey,
  newPrivateKey,
  privateRef,
  presentFile,
  PublicKind,
  PrivateKind,
  ImageSize,
  publicKeyFromUrl,
} from '../storage';

/**
 * Turning uploads into stored files.
 *
 * Nothing the client says about a file is trusted: images are decoded and
 * re-encoded by sharp (which rejects anything that isn't really an image and
 * strips EXIF, including GPS location), and audio / PDF are checked by their
 * magic bytes. Public images are stored in three sizes so lists can load a small
 * thumbnail instead of the original photo.
 */

const IMAGE_SIZES: Record<ImageSize, number> = { lg: 1280, md: 640, sm: 320 };
const SIZES = Object.keys(IMAGE_SIZES) as ImageSize[];
const MAX_INPUT_PIXELS = 40_000_000;

async function decodeImage(buffer: Buffer) {
  try {
    const img = sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false });
    const meta = await img.metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff'].includes(meta.format)) {
      throw new Error(`unsupported format ${meta.format}`);
    }
    return img.rotate(); // apply the EXIF orientation before the metadata is dropped
  } catch {
    throw new AppError('That file is not a valid image (JPEG, PNG, WebP or GIF)', 400, 'INVALID_FILE_TYPE');
  }
}

export interface StoredImage {
  url: string;
  mediumUrl: string;
  thumbnailUrl: string;
}

/**
 * A public image (product photo, avatar, cover) in three sizes; returns their URLs. It is all or nothing: when a size
 * cannot be written, the sizes already stored are removed, so a failed upload leaves no files behind that nothing
 * points to (a retry gets a new id, and would never find them).
 */
export async function storePublicImage(kind: PublicKind, ownerId: string, buffer: Buffer): Promise<StoredImage> {
  const img = await decodeImage(buffer);
  const id = crypto.randomUUID();
  const urls: Partial<Record<ImageSize, string>> = {};
  try {
    for (const size of SIZES) {
      const out = await img
        .clone()
        .resize({ width: IMAGE_SIZES[size], height: IMAGE_SIZES[size], fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const key = newPublicKey(kind, ownerId, size, id);
      await storage().put(key, out, 'image/webp', 'public');
      urls[size] = storage().publicUrl(key);
    }
  } catch (err) {
    // Every size, including the one that failed: a write that timed out may still have reached the store.
    await Promise.all(
      SIZES.map(async (size) => {
        const key = newPublicKey(kind, ownerId, size, id);
        try {
          await storage().delete(key, 'public');
        } catch (cleanupErr) {
          logger.warn({ err: cleanupErr, key }, 'Could not remove a size of an image that failed to upload');
        }
      })
    );
    throw err;
  }
  return { url: urls.lg!, mediumUrl: urls.md!, thumbnailUrl: urls.sm! };
}

/**
 * Delete all sizes of a public image we stored (false for anything else). Every size is tried even when one fails;
 * the first failure is thrown afterwards, so the caller does not report a deletion that left files behind.
 */
export async function deletePublicImage(url: string): Promise<boolean> {
  const key = publicKeyFromUrl(url);
  if (!key) return false;
  const base = key.replace(/-(lg|md|sm)\.webp$/, '');
  const results = await Promise.allSettled(SIZES.map((size) => storage().delete(`${base}-${size}.webp`, 'public')));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
  return true;
}

export interface StoredPrivateFile {
  /** What gets saved in the database. */
  ref: string;
  /** A short-lived link the uploader can preview it with. */
  previewUrl: string | null;
  contentType: string;
}

/** A private image (payment receipt, document photo): re-encoded, metadata stripped. */
export async function storePrivateImage(kind: PrivateKind, ownerId: string, buffer: Buffer): Promise<StoredPrivateFile> {
  const img = await decodeImage(buffer);
  const out = await img
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const key = newPrivateKey(kind, ownerId, 'jpg');
  await storage().put(key, out, 'image/jpeg', 'private');
  const ref = privateRef(key);
  return { ref, previewUrl: await presentFile(ref), contentType: 'image/jpeg' };
}

const AUDIO_SIGNATURES: Array<{ type: string; ext: string; test: (b: Buffer) => boolean }> = [
  { type: 'audio/webm', ext: 'webm', test: (b) => b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3 },
  { type: 'audio/ogg', ext: 'ogg', test: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  { type: 'audio/mpeg', ext: 'mp3', test: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { type: 'audio/mp4', ext: 'm4a', test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' },
  { type: 'audio/wav', ext: 'wav', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE' },
];

/** A private voice note: accepted only if its bytes really are audio. */
export async function storePrivateAudio(kind: PrivateKind, ownerId: string, buffer: Buffer): Promise<StoredPrivateFile> {
  const sig = AUDIO_SIGNATURES.find((s) => s.test(buffer));
  if (!sig) throw new AppError('That file is not a supported audio recording', 400, 'INVALID_FILE_TYPE');
  const key = newPrivateKey(kind, ownerId, sig.ext);
  await storage().put(key, buffer, sig.type, 'private');
  const ref = privateRef(key);
  return { ref, previewUrl: await presentFile(ref), contentType: sig.type };
}

/** A private PDF document. */
export async function storePrivatePdf(kind: PrivateKind, ownerId: string, buffer: Buffer): Promise<StoredPrivateFile> {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new AppError('That file is not a valid PDF', 400, 'INVALID_FILE_TYPE');
  }
  const key = newPrivateKey(kind, ownerId, 'pdf');
  await storage().put(key, buffer, 'application/pdf', 'private');
  const ref = privateRef(key);
  return { ref, previewUrl: await presentFile(ref), contentType: 'application/pdf' };
}
