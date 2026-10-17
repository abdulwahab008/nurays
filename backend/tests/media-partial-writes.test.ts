import fs from 'fs';
import os from 'os';
import path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nuray-media-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOADS_DIR = root;
delete process.env.ASSET_BASE_URL;

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import sharp from 'sharp';
import { storage, resetStorage } from '../src/storage';
import { storePublicImage, deletePublicImage } from '../src/services/media.service';
import { uploadProductImages } from '../src/controllers/upload.controller';
import { logger } from '../src/utils/logger';

const owner = '11111111-2222-3333-4444-555555555555';
let png: Buffer;

const dir = () => path.join(root, 'media', 'p', 'products', owner);
const filesOnDisk = () => (fs.existsSync(dir()) ? fs.readdirSync(dir()).sort() : []);

beforeAll(async () => {
  png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#cc3333' } }).png().toBuffer();
});
beforeEach(() => {
  resetStorage();
  fs.rmSync(path.join(root, 'media'), { recursive: true, force: true });
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** The driver's real put, wrapped so a test can break one size. */
function breakPut(size: 'lg' | 'md' | 'sm', { afterWriting = false } = {}) {
  const driver = storage();
  const real = driver.put.bind(driver);
  return jest.spyOn(driver, 'put').mockImplementation(async (key, body, type, visibility) => {
    if (key.endsWith(`-${size}.webp`)) {
      if (afterWriting) await real(key, body, type, visibility);
      throw new Error('storage unavailable');
    }
    return real(key, body, type, visibility);
  });
}

describe('storing a public image', () => {
  it('writes the three sizes', async () => {
    const stored = await storePublicImage('products', owner, png);
    expect(filesOnDisk().map((f) => f.replace(/^.*-/, ''))).toEqual(['lg.webp', 'md.webp', 'sm.webp']);
    expect(stored.url).toMatch(/-lg\.webp$/);
    expect(stored.mediumUrl).toMatch(/-md\.webp$/);
    expect(stored.thumbnailUrl).toMatch(/-sm\.webp$/);
  });

  it('leaves nothing behind when the second size cannot be written', async () => {
    breakPut('md');
    await expect(storePublicImage('products', owner, png)).rejects.toThrow('storage unavailable');
    expect(filesOnDisk()).toEqual([]);
  });

  it('leaves nothing behind when the last size cannot be written', async () => {
    breakPut('sm');
    await expect(storePublicImage('products', owner, png)).rejects.toThrow('storage unavailable');
    expect(filesOnDisk()).toEqual([]);
  });

  it('removes a size whose write failed after the bytes had arrived', async () => {
    breakPut('md', { afterWriting: true });
    await expect(storePublicImage('products', owner, png)).rejects.toThrow('storage unavailable');
    expect(filesOnDisk()).toEqual([]);
  });

  it('reports the write that failed, not a failure of the cleanup, and says what it could not remove', async () => {
    breakPut('sm');
    jest.spyOn(storage(), 'delete').mockRejectedValue(new Error('delete denied'));
    await expect(storePublicImage('products', owner, png)).rejects.toThrow('storage unavailable');
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(filesOnDisk()).toHaveLength(2); // nothing could be removed, and the log has every key
  });
});

describe('deleting a public image', () => {
  it('tries every size even when one cannot be deleted, then reports the failure', async () => {
    const stored = await storePublicImage('products', owner, png);
    const driver = storage();
    const real = driver.delete.bind(driver);
    jest.spyOn(driver, 'delete').mockImplementation(async (key, visibility) => {
      if (key.endsWith('-lg.webp')) throw new Error('delete denied');
      return real(key, visibility);
    });
    await expect(deletePublicImage(stored.url)).rejects.toThrow('delete denied');
    expect(filesOnDisk().map((f) => f.replace(/^.*-/, ''))).toEqual(['lg.webp']);
  });

  it('removes all three sizes', async () => {
    const stored = await storePublicImage('products', owner, png);
    await expect(deletePublicImage(stored.thumbnailUrl)).resolves.toBe(true);
    expect(filesOnDisk()).toEqual([]);
  });

  it('refuses an address that is not one of ours', async () => {
    await expect(deletePublicImage('https://evil.example/p/products/x/a-lg.webp')).resolves.toBe(false);
  });
});

describe('uploading several product photos at once', () => {
  const call = async (buffers: Buffer[]) => {
    const req = {
      user: { userId: owner, userType: 'seller' },
      files: buffers.map((buffer, i) => ({ buffer, originalname: `photo-${i}.png`, size: buffer.length })),
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await uploadProductImages(req as never, res as never);
    return res;
  };

  it('stores every photo and answers with their addresses', async () => {
    const res = await call([png, png]);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.images).toHaveLength(2);
    expect(body.data.images[0].isPrimary).toBe(true);
    expect(filesOnDisk()).toHaveLength(6);
  });

  it('removes the photos already stored when a later one is refused', async () => {
    await expect(call([png, png, Buffer.from('this is not an image')])).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    expect(filesOnDisk()).toEqual([]);
  });

  it('removes the earlier photos when the storage fails on a later one', async () => {
    const driver = storage();
    const real = driver.put.bind(driver);
    let writes = 0;
    jest.spyOn(driver, 'put').mockImplementation(async (key, body, type, visibility) => {
      if (++writes === 5) throw new Error('storage unavailable'); // the second size of the second photo
      return real(key, body, type, visibility);
    });
    await expect(call([png, png])).rejects.toThrow('storage unavailable');
    expect(filesOnDisk()).toEqual([]);
  });
});
