/**
 * Uploads that are wrong in ways only the sender can fix are answered 400, not 500: a body multer cannot read at all,
 * and a picture whose header is fine but whose data is cut short (the header check passes, the real decode fails later).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import multer from 'multer';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nuray-upload-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOADS_DIR = root;
delete process.env.ASSET_BASE_URL;

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import sharp from 'sharp';
import { resetStorage } from '../src/storage';
import { storePublicImage, storePrivateImage } from '../src/services/media.service';
import { asBadUpload } from '../src/services/upload.service';
import { errorHandler, AppError } from '../src/middleware/errorHandler';
import { logger } from '../src/utils/logger';

const owner = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  resetStorage();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a picture that is cut short', () => {
  // A noisy picture does not compress away, so half of its bytes really are missing pixels.
  let png: Buffer;
  beforeAll(async () => {
    const raw = Buffer.alloc(300 * 300 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    png = await sharp(raw, { raw: { width: 300, height: 300, channels: 3 } }).png().toBuffer();
  });

  it('is refused as not an image (400 INVALID_FILE_TYPE) when stored for the public', async () => {
    const cut = png.subarray(0, Math.floor(png.length / 2));
    await expect(storePublicImage('products', owner, cut)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILE_TYPE' });
  });

  it('is refused the same way when stored privately (a receipt, a document)', async () => {
    const cut = png.subarray(0, Math.floor(png.length / 2));
    await expect(storePrivateImage('proofs', owner, cut)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILE_TYPE' });
  });

  it('leaves no files behind for the refused one, and the whole picture still stores', async () => {
    const cut = png.subarray(0, Math.floor(png.length / 2));
    await storePublicImage('products', owner, cut).catch(() => undefined);
    const dir = path.join(root, 'media', 'p', 'products', owner);
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
    await expect(storePublicImage('products', owner, png)).resolves.toHaveProperty('url');
  });
});

describe('asBadUpload', () => {
  const run = (handler: Parameters<typeof asBadUpload>[0]) =>
    new Promise<unknown>((resolve) => asBadUpload(handler)({} as never, {} as never, (err?: unknown) => resolve(err)));

  it('turns a body the parser could not read into 400 INVALID_UPLOAD', async () => {
    const err = (await run((_q, _s, next) => next(new Error('Unexpected end of form')))) as AppError;
    expect([err.statusCode, err.code]).toEqual([400, 'INVALID_UPLOAD']);
  });

  it('leaves a size limit (a MulterError) and our own errors as they were, and passes success through', async () => {
    const limit = new multer.MulterError('LIMIT_FILE_SIZE');
    expect(await run((_q, _s, next) => next(limit))).toBe(limit);
    const own = new AppError('nope', 403, 'FORBIDDEN');
    expect(await run((_q, _s, next) => next(own))).toBe(own);
    expect(await run((_q, _s, next) => next())).toBeUndefined();
  });
});

describe('the upload routes, over HTTP, with broken multipart bodies', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024, files: 1 } });
    app.post('/upload', asBadUpload(upload.single('avatar')), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = async (contentType: string, body: string) => {
    const res = await fetch(`${base}/upload`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    return { status: res.status, body: (await res.json()) as any };
  };

  it.each([
    ['no boundary', 'multipart/form-data', 'x'],
    ['an empty body', 'multipart/form-data; boundary=abc', ''],
    ['a body cut short', 'multipart/form-data; boundary=abc', '--abc\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\n\r\nPNGDATA'],
    ['a mangled part header', 'multipart/form-data; boundary=abc', '--abc\r\nContent-Disposition: \u0001\u0002\r\n\r\nx\r\n--abc--\r\n'],
  ])('answers %s with a 400, not a 500', async (_name, type, body) => {
    const res = await post(type, body);
    expect([res.status, res.body.error?.code]).toEqual([400, 'INVALID_UPLOAD']);
  });

  it('keeps answering 413 for a file over the size limit', async () => {
    const big = `--abc\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n${'x'.repeat(4096)}\r\n--abc--\r\n`;
    expect((await post('multipart/form-data; boundary=abc', big)).status).toBe(413);
  });
});
