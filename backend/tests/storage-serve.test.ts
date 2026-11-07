import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// A dot-directory in the path, as in ~/.local/share or a .claude/worktrees checkout.
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nuray-serve-'));
const root = path.join(parent, '.data', 'uploads');
fs.mkdirSync(root, { recursive: true });
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOADS_DIR = root;
delete process.env.ASSET_BASE_URL;

import express from 'express';
import { storage, LocalStorage } from '../src/storage';
import { fileRoutes } from '../src/storage/serve';

let server: Server;
let base: string;
const s = storage() as LocalStorage;

beforeAll(async () => {
  const app = express();
  app.use(fileRoutes());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(parent, { recursive: true, force: true });
});

describe('private file links', () => {
  it('serves a signed file when the uploads folder sits under a dot-directory', async () => {
    const key = 'x/docs/owner/cnic.jpg';
    await s.put(key, Buffer.from('jpeg-bytes'), 'image/jpeg', 'private');
    const res = await fetch(base + (await s.signedUrl(key, 60)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('jpeg-bytes');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('still refuses a dotfile inside the key', async () => {
    const key = 'x/docs/owner/.secret';
    await s.put(key, Buffer.from('hidden'), 'text/plain', 'private');
    const res = await fetch(base + (await s.signedUrl(key, 60)));
    expect(res.status).toBe(404);
  });

  it('refuses a link with a bad signature', async () => {
    const key = 'x/docs/owner/cnic.jpg';
    const res = await fetch(`${base}/files/${key}?exp=${Math.floor(Date.now() / 1000) + 60}&sig=00`);
    expect(res.status).toBe(403);
  });

  it('answers 404 for a signed link to a file that is not there', async () => {
    const res = await fetch(base + (await s.signedUrl('x/docs/owner/missing.jpg', 60)));
    expect(res.status).toBe(404);
  });
});
