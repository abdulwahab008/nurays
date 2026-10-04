import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageDriver, Visibility } from './types';

export interface S3Config {
  bucket: string;
  privateBucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  assetBaseUrl: string;
}

/**
 * Any S3-compatible object store: AWS S3, Cloudflare R2, Backblaze B2, MinIO.
 * Public objects (product images, avatars) are written with long immutable
 * cache headers and served from ASSET_BASE_URL (your CDN or the bucket's public
 * URL). Private objects (payment receipts, documents, chat media) go to the
 * private bucket, which must NOT be publicly readable; they are only ever
 * reached through short-lived presigned links.
 */
export class S3Storage implements StorageDriver {
  readonly name = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    });
  }

  private bucketFor(visibility: Visibility): string {
    return visibility === 'public' ? this.cfg.bucket : this.cfg.privateBucket;
  }

  async put(key: string, body: Buffer, contentType: string, visibility: Visibility): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(visibility),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      })
    );
  }

  async delete(key: string, visibility: Visibility): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketFor(visibility), Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.cfg.assetBaseUrl}/${key}`;
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.cfg.privateBucket,
        Key: key,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: ttlSeconds }
    );
  }
}
