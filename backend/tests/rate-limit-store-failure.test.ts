import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

/** The Redis the limiter's counters live in: answers like one until `failing`, then every command errors, as when it is down or frozen. */
const mockRedis = {
  failing: false,
  brokenScriptReply: false,
  call: jest.fn(async (command: string): Promise<unknown> => {
    if (mockRedis.failing) throw new Error('Command timed out');
    if (command === 'SCRIPT') return mockRedis.brokenScriptReply ? undefined : 'a'.repeat(40);
    return [1, 60_000];
  }),
};
jest.mock('../src/config/redis', () => ({ getRedis: () => mockRedis }));

type Logger = typeof import('../src/utils/logger').logger;
let logger: Logger;
let server: http.Server;
let url: string;

/** The API limiter on a small app, freshly loaded: what it has reported so far is its own. */
beforeEach(async () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { apiLimiter } = require('../src/middleware/rateLimiter') as typeof import('../src/middleware/rateLimiter');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  logger = require('../src/utils/logger').logger;
  const app = express(); // trust proxy left off, as the library's own checks expect to find it in a test
  app.use('/api', apiLimiter);
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ping`;
});
afterEach(() => {
  server.closeAllConnections();
  server.close();
  mockRedis.failing = false;
  mockRedis.brokenScriptReply = false;
  jest.restoreAllMocks();
});

const ask = async () => (await fetch(url)).status;
const storeReports = (warned: jest.SpyInstance) => warned.mock.calls.filter(([, message]) => /Rate limits are not being counted/.test(message));

describe('the rate limiter while its counters cannot be read', () => {
  it('lets the requests through and says so once, not once per request, without a stack', async () => {
    mockRedis.failing = true;
    const warned = jest.spyOn(logger, 'warn');
    const errored = jest.spyOn(logger, 'error');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const statuses = new Set<number>();
    for (let i = 0; i < 30; i++) statuses.add(await ask());

    expect(statuses).toEqual(new Set([200]));
    expect(storeReports(warned)).toHaveLength(1);
    expect(storeReports(warned)[0][0]).toEqual({ reason: 'Command timed out', requestsSinceLastReport: 1 });
    expect(errored).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reports again after a minute, with how many requests it let through meanwhile', async () => {
    mockRedis.failing = true;
    const warned = jest.spyOn(logger, 'warn');
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    for (let i = 0; i < 6; i++) await ask(); // the first is reported, the other five within the minute are not
    expect(storeReports(warned)).toHaveLength(1);

    clock.mockReturnValue(now + 61_000);
    await ask();
    expect(storeReports(warned)).toHaveLength(2);
    expect(storeReports(warned)[1][0]).toEqual({ reason: 'Command timed out', requestsSinceLastReport: 6 }); // five skipped, and this one
  });

  it('says nothing while the counters work', async () => {
    const warned = jest.spyOn(logger, 'warn');
    const errored = jest.spyOn(logger, 'error');
    for (let i = 0; i < 5; i++) expect(await ask()).toBe(200);
    expect(storeReports(warned)).toHaveLength(0);
    expect(errored).not.toHaveBeenCalled();
  });

  it('still reports any other trouble to the structured logger as it comes, such as a store that cannot be set up', async () => {
    jest.resetModules();
    mockRedis.brokenScriptReply = true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const freshLogger = require('../src/utils/logger').logger as Logger;
    const errored = jest.spyOn(freshLogger, 'error');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../src/middleware/rateLimiter');
    await new Promise((resolve) => setImmediate(resolve));
    expect(errored).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(TypeError) }), 'express-rate-limit: async error during store initialization.');
  });
});
