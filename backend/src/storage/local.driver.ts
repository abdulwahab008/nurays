import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { StorageDriver, Visibility } from './types';

/**
 * Files on this server's disk, for development or a single server with a
 * persistent, backed-up volume (UPLOADS_DIR). Public objects are served from
 * /media (immutable cache headers, so a CDN can sit in front via ASSET_BASE_URL);
 * private ones only through /files with an expiring HMAC-signed link.
 */
export class LocalStorage implements StorageDriver {
  readonly name = 'local' as const;
  readonly root: string;

  constructor(root: string, private readonly assetBaseUrl: string, private readonly signingSecret: string) {
    this.root = root;
  }

  dirFor(visibility: Visibility): string {
    return path.join(this.root, visibility === 'public' ? 'media' : 'private');
  }

  /** Resolve a key to a path inside the right directory, refusing anything that escapes it. */
  pathFor(key: string, visibility: Visibility): string {
    const base = this.dirFor(visibility);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer, _contentType: string, visibility: Visibility): Promise<void> {
    const target = this.pathFor(key, visibility);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    await fs.promises.writeFile(tmp, body);
    await fs.promises.rename(tmp, target);
  }

  async delete(key: string, visibility: Visibility): Promise<void> {
    await fs.promises.rm(this.pathFor(key, visibility), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.assetBaseUrl}/media/${key}`;
  }

  sign(key: string, exp: number): string {
    return crypto.createHmac('sha256', this.signingSecret).update(`${key}\n${exp}`).digest('hex');
  }

  verify(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(key, exp), 'hex');
    const given = Buffer.from(String(sig), 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `/files/${key}?exp=${exp}&sig=${this.sign(key, exp)}`;
  }
}
