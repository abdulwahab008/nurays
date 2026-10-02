export type Visibility = 'public' | 'private';

export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string, visibility: Visibility): Promise<void>;
  delete(key: string, visibility: Visibility): Promise<void>;
  /** Where a public object is fetched from (a CDN when ASSET_BASE_URL is set). */
  publicUrl(key: string): string;
  /** A short-lived link to a private object, for a viewer the caller has already authorised. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}
