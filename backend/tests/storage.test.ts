import fs from 'fs';
import os from 'os';
import path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nuray-storage-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOADS_DIR = root;
delete process.env.ASSET_BASE_URL;

import {
  storage,
  resetStorage,
  LocalStorage,
  isStoredFile,
  storedFileOwner,
  publicKeyFromUrl,
  presentFile,
  privateRef,
} from '../src/storage';

const owner = '11111111-2222-3333-4444-555555555555';

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('stored file links', () => {
  it('accepts our own public images, private refs and legacy uploads', () => {
    expect(isStoredFile(`/media/p/products/${owner}/abc-lg.webp`)).toBe(true);
    expect(isStoredFile(privateRef(`x/proofs/${owner}/abc.jpg`))).toBe(true);
    expect(isStoredFile(`/uploads/products/${owner}_x.png`)).toBe(true);
  });

  it('refuses external, protocol-relative, data: and traversal links', () => {
    for (const bad of ['https://evil.example/x.png', '//evil.example/x.png', 'data:image/png;base64,AAAA', '/media/p/products/../../etc/passwd', 'private:x/proofs/../../secret', 'javascript:alert(1)']) {
      expect(isStoredFile(bad)).toBe(false);
    }
  });

  it('checks the kind of file', () => {
    expect(isStoredFile(privateRef(`x/proofs/${owner}/a.jpg`), { private: 'proofs' })).toBe(true);
    expect(isStoredFile(privateRef(`x/chat/${owner}/a.webm`), { private: 'proofs' })).toBe(false);
    expect(isStoredFile(`/media/p/avatars/${owner}/a-md.webp`, { public: 'products' })).toBe(false);
    // a public image can't be passed off as a private receipt
    expect(isStoredFile(`/media/p/products/${owner}/a-lg.webp`, { private: 'proofs' })).toBe(false);
  });

  it('knows who uploaded a file', () => {
    expect(storedFileOwner(`/media/p/products/${owner}/a-lg.webp`)).toBe(owner);
    expect(storedFileOwner(privateRef(`x/proofs/${owner}/a.jpg`))).toBe(owner);
    expect(storedFileOwner(`/uploads/products/${owner}_x.png`)).toBe(owner);
  });

  it('extracts the key of a public image, and only of ours', () => {
    expect(publicKeyFromUrl(`/media/p/products/${owner}/a-lg.webp`)).toBe(`p/products/${owner}/a-lg.webp`);
    expect(publicKeyFromUrl('https://cdn.other.example/p/products/x/a-lg.webp')).toBeNull();
  });
});

describe('local driver', () => {
  beforeEach(() => resetStorage());

  it('writes public and private objects to separate directories', async () => {
    const s = storage() as LocalStorage;
    await s.put(`p/products/${owner}/a-lg.webp`, Buffer.from('pub'), 'image/webp', 'public');
    await s.put(`x/proofs/${owner}/a.jpg`, Buffer.from('priv'), 'image/jpeg', 'private');
    expect(fs.existsSync(path.join(root, 'media', `p/products/${owner}/a-lg.webp`))).toBe(true);
    expect(fs.existsSync(path.join(root, 'private', `x/proofs/${owner}/a.jpg`))).toBe(true);
    expect(fs.existsSync(path.join(root, 'media', `x/proofs/${owner}/a.jpg`))).toBe(false);
  });

  it('refuses keys that escape the storage directory', () => {
    const s = storage() as LocalStorage;
    expect(() => s.pathFor('../../etc/passwd', 'private')).toThrow();
  });

  it('signs private links that expire and cannot be altered', async () => {
    const s = storage() as LocalStorage;
    const key = `x/proofs/${owner}/a.jpg`;
    const url = (await presentFile(privateRef(key)))!;
    const u = new URL(url, 'http://x');
    expect(u.pathname).toBe(`/files/${key}`);
    const exp = Number(u.searchParams.get('exp'));
    const sig = u.searchParams.get('sig')!;
    expect(s.verify(key, exp, sig)).toBe(true);
    expect(s.verify(`x/proofs/${owner}/b.jpg`, exp, sig)).toBe(false); // another file
    expect(s.verify(key, exp + 60, sig)).toBe(false); // extended expiry
    expect(s.verify(key, Math.floor(Date.now() / 1000) - 1, s.sign(key, Math.floor(Date.now() / 1000) - 1))).toBe(false); // expired
  });

  it('returns non-private values unchanged', async () => {
    expect(await presentFile('/media/p/products/x/a-lg.webp')).toBe('/media/p/products/x/a-lg.webp');
    expect(await presentFile(null)).toBeNull();
  });
});

describe('local driver, when a write fails', () => {
  const key = `p/avatars/${owner}/a-lg.webp`;
  const dir = () => path.join(root, 'media', 'p', 'avatars', owner);
  const filesInDir = () => (fs.existsSync(dir()) ? fs.readdirSync(dir()).sort() : []);
  const diskFull = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });

  beforeEach(() => {
    resetStorage();
    fs.rmSync(dir(), { recursive: true, force: true });
  });
  afterEach(() => jest.restoreAllMocks());

  /** A writeFile that gets part of the data onto the disk, then runs out of room, as a full disk does. */
  function fillUpDuringWrite() {
    const realWrite = fs.promises.writeFile.bind(fs.promises);
    return jest.spyOn(fs.promises, 'writeFile').mockImplementation(async (file, data) => {
      await realWrite(file, (data as Buffer).subarray(0, 4));
      throw diskFull();
    });
  }

  it('leaves no partly written file behind, and says why it failed', async () => {
    fillUpDuringWrite();
    await expect(storage().put(key, Buffer.from('image bytes'), 'image/webp', 'public')).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(filesInDir()).toEqual([]);
  });

  it('leaves no temporary file behind when the last step, moving it into place, fails', async () => {
    jest.spyOn(fs.promises, 'rename').mockRejectedValue(Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }));
    await expect(storage().put(key, Buffer.from('image bytes'), 'image/webp', 'public')).rejects.toMatchObject({ code: 'EACCES' });
    expect(filesInDir()).toEqual([]);
  });

  it('reports the write that failed, not a failure to clean up after it', async () => {
    fillUpDuringWrite();
    jest.spyOn(fs.promises, 'rm').mockRejectedValue(Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' }));
    await expect(storage().put(key, Buffer.from('image bytes'), 'image/webp', 'public')).rejects.toMatchObject({ code: 'ENOSPC' });
  });

  it('keeps the file that was there when a replacement fails', async () => {
    await storage().put(key, Buffer.from('the old image'), 'image/webp', 'public');
    fillUpDuringWrite();
    await expect(storage().put(key, Buffer.from('the new image'), 'image/webp', 'public')).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(filesInDir()).toEqual(['a-lg.webp']);
    expect(fs.readFileSync(path.join(dir(), 'a-lg.webp'), 'utf8')).toBe('the old image');
  });

  it('leaves just the file when the write succeeds', async () => {
    await storage().put(key, Buffer.from('image bytes'), 'image/webp', 'public');
    expect(filesInDir()).toEqual(['a-lg.webp']);
  });
});
