import http from 'http';
import type { AddressInfo } from 'net';
import { resetStorage, storage } from '../src/storage';
import { S3Storage } from '../src/storage/s3.driver';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An object store that accepts every request and answers it after `answerAfterMs`, or never. */
async function listen(answerAfterMs: number | null) {
  const server = http.createServer((req, res) => {
    req.resume();
    if (answerAfterMs === null) return;
    req.on('end', () => setTimeout(() => res.writeHead(200, { ETag: '"abc"' }).end(), answerAfterMs));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

const driver = (endpoint: string, requestTimeoutMs?: number) =>
  new S3Storage({
    bucket: 'bucket',
    privateBucket: 'private-bucket',
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret-example',
    assetBaseUrl: 'http://cdn.example.test',
    requestTimeoutMs,
  });

/** What became of a call: its error's name, 'resolved', or 'still waiting' when nothing happened within `limitMs`. */
const outcome = (call: Promise<unknown>, limitMs = 4_000) =>
  Promise.race([call.then(() => 'resolved', (err: Error) => err.name), sleep(limitMs).then(() => 'still waiting')]);

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  resetStorage();
});

describe('the S3 driver against an object store that stops answering', () => {
  it('fails an upload instead of waiting on the store for as long as it stays silent', async () => {
    const store = await listen(null);
    try {
      expect(await outcome(driver(store.endpoint, 200).put('p/avatars/u/a-lg.webp', Buffer.from('bytes'), 'image/webp', 'public'))).toBe('TimeoutError');
    } finally {
      store.close();
    }
  });

  it('fails a delete the same way', async () => {
    const store = await listen(null);
    try {
      expect(await outcome(driver(store.endpoint, 200).delete('p/avatars/u/a-lg.webp', 'public'))).toBe('TimeoutError');
    } finally {
      store.close();
    }
  });

  it('lets a store that answers within the limit finish', async () => {
    const store = await listen(100);
    try {
      expect(await outcome(driver(store.endpoint, 2_000).put('p/avatars/u/a-lg.webp', Buffer.from('bytes'), 'image/webp', 'public'))).toBe('resolved');
    } finally {
      store.close();
    }
  });
});

describe('S3_REQUEST_TIMEOUT_MS', () => {
  const useS3 = (endpoint: string, timeout: string) => {
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'bucket',
      S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-example',
      ASSET_BASE_URL: 'http://cdn.example.test',
      S3_REQUEST_TIMEOUT_MS: timeout,
    });
    resetStorage();
    return storage();
  };

  it('sets how long a request to the store may take', async () => {
    const store = await listen(null);
    try {
      expect(await outcome(useS3(store.endpoint, '200').put('p/avatars/u/a-lg.webp', Buffer.from('bytes'), 'image/webp', 'public'))).toBe('TimeoutError');
    } finally {
      store.close();
    }
  });

  it.each(['0', '-5', 'soon', ''])('ignores %p rather than failing every upload at once', async (bad) => {
    const store = await listen(50);
    try {
      expect(await outcome(useS3(store.endpoint, bad).put('p/avatars/u/a-lg.webp', Buffer.from('bytes'), 'image/webp', 'public'))).toBe('resolved');
    } finally {
      store.close();
    }
  });
});
