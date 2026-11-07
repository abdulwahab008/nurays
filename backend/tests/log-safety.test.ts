/** What reaches the logs: secrets redacted at any depth, no secret query values, one line and one id field per failure. */
import type { AddressInfo } from 'net';
import express from 'express';
import pino from 'pino';

jest.mock('../src/config/sentry', () => ({ reportError: jest.fn() }));

import { logger, logEvent, requestContext } from '../src/utils/logger';
import { requestId, httpLogger, safeUrl } from '../src/middleware/requestContext';
import { errorHandler } from '../src/middleware/errorHandler';

const stream = (logger as unknown as Record<symbol, { write: (s: string) => void }>)[pino.symbols.streamSym];
let lines: Record<string, unknown>[] = [];
let write: jest.SpyInstance;

beforeEach(() => {
  lines = [];
  logger.level = 'info';
  write = jest.spyOn(stream, 'write').mockImplementation((s: string) => {
    lines.push(JSON.parse(s));
    return true;
  });
});
afterEach(() => {
  write.mockRestore();
  logger.level = 'warn';
});

const SECRETS = {
  password: 'S1',
  token: 'S2',
  accessToken: 'S3',
  refreshToken: 'S4',
  authorization: 'S5',
  cookie: 'S6',
  otp: 'S7',
  code: 'S8',
  sig: 'S9',
  signature: 'S10',
  cardNumber: 'S11',
  cvv: 'S12',
};

describe('logger redaction', () => {
  it('redacts secret keys at the top level, nested in objects and arrays, and in any letter case', () => {
    const input = { ...SECRETS, a: { ...SECRETS, b: [{ ...SECRETS, c: { ...SECRETS, Authorization: 'S13', keep: 'visible' } }] } };
    logger.info(input, 'secrets');
    const out = JSON.stringify(lines[0]);
    for (const value of [...Object.values(SECRETS), 'S13']) expect(out).not.toContain(`"${value}"`);
    expect(out).toContain('visible');
    expect(input.a.b[0].c.keep).toBe('visible');
    expect(input.password).toBe('S1');
  });

  it("keeps an error's own code but hides the auth header of the request an HTTP client error carries", () => {
    const err = Object.assign(new Error('upstream'), { code: 'ECONNRESET', config: { headers: { authorization: 'Bearer S14' } } });
    logger.error({ err }, 'failed');
    expect(lines[0]).toMatchObject({ err: { code: 'ECONNRESET', config: { headers: { authorization: '[redacted]' } } } });
  });
});

describe('logEvent', () => {
  it('writes an info line with the event name and the current request id', () => {
    requestContext.run({ requestId: 'rid-0123456789abcdef' }, () => logEvent('order.placed', { orderId: 'o1' }));
    expect(lines[0]).toMatchObject({ level: 30, event: 'order.placed', orderId: 'o1', requestId: 'rid-0123456789abcdef', msg: 'order.placed' });
  });
});

describe('safeUrl', () => {
  it('keeps the path and query keys but not secret values', () => {
    expect(safeUrl('/files/x/a.pdf?exp=99&sig=abc')).toBe('/files/x/a.pdf?exp=99&sig=[redacted]');
    expect(safeUrl('/pay/return?tracker=t1&page=2')).toBe('/pay/return?tracker=[redacted]&page=2');
    expect(safeUrl('/orders')).toBe('/orders');
  });
});

describe('request logging', () => {
  const app = express();
  app.use(requestId, httpLogger);
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  let base: string;
  let server: ReturnType<typeof app.listen>;
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('logs a 5xx at error level once, with a single request id field', async () => {
    await fetch(`${base}/boom`);
    await settle();
    expect(lines.filter((l) => (l.level as number) >= 50)).toHaveLength(1);
    expect(lines.every((l) => !('reqId' in l))).toBe(true);
    const requestLine = lines.find((l) => l.req) as { level: number; err?: unknown; requestId?: string };
    expect(requestLine).toMatchObject({ level: 40, requestId: expect.any(String) });
    expect(requestLine.err).toBeUndefined();
  });

  it('keeps a well-formed proxy id, replaces a short or odd one, and never logs a secret query value', async () => {
    const proxyId = '0123456789abcdef0123456789abcdef';
    const kept = await fetch(`${base}/ok?sig=SECRET-SIG&page=1`, { headers: { 'X-Request-Id': proxyId } });
    expect(kept.headers.get('x-request-id')).toBe(proxyId);
    const replaced = await fetch(`${base}/ok`, { headers: { 'X-Request-Id': 'forged-1' } });
    expect(replaced.headers.get('x-request-id')).not.toBe('forged-1');
    await settle();
    expect(JSON.stringify(lines)).not.toContain('SECRET-SIG');
    expect(lines[0]).toMatchObject({ requestId: proxyId, req: { url: '/ok?sig=[redacted]&page=1' } });
  });
});
