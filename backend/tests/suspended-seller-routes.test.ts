/**
 * A kitchen the administrator has suspended must stop changing its menu: dish variants (price, stock), promo codes and
 * dish photos were still open to it, while the dish and order routes already answered 403 SELLER_ACCOUNT_INACTIVE.
 * The real routers run behind a stand-in for sign-in; the database is a double that only knows the kitchen's status.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const seller = { findUnique: jest.fn() };
jest.mock('../src/config/database', () => ({ __esModule: true, default: { seller: { findUnique: (...a: unknown[]) => seller.findUnique(...a) } } }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(), auditWrites: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
jest.mock('../src/middleware/auth.middleware', () => {
  const actual = jest.requireActual('../src/middleware/auth.middleware');
  return {
    ...actual,
    authenticate: (req: any, _res: unknown, next: () => void) => {
      req.user = { id: 'user-1', userId: 'user-1', userType: 'seller' };
      next();
    },
  };
});

import productVariantRoutes from '../src/routes/product-variant.routes';
import promotionRoutes from '../src/routes/promotion.routes';
import uploadRoutes from '../src/routes/upload.routes';
import { errorHandler } from '../src/middleware/errorHandler';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/product-variants', productVariantRoutes);
  app.use('/promotions', promotionRoutes);
  app.use('/upload', uploadRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = async (method: string, path: string, body: unknown = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

const WRITES: Array<[string, string]> = [
  ['POST', '/product-variants'],
  ['POST', '/product-variants/bulk'],
  ['PATCH', '/product-variants/v1'],
  ['DELETE', '/product-variants/v1'],
  ['POST', '/promotions'],
  ['PATCH', '/promotions/p1'],
  ['DELETE', '/promotions/p1'],
  ['GET', '/promotions'],
  ['POST', '/upload/product-images'],
  ['DELETE', '/upload/product-images?url=x'],
  ['DELETE', '/upload/product-images/some-file.png'],
];

describe('a suspended kitchen', () => {
  beforeEach(() => seller.findUnique.mockResolvedValue({ id: 's1', status: 'suspended' }));

  it.each(WRITES)('is turned away from %s %s with 403 SELLER_ACCOUNT_INACTIVE', async (method, path) => {
    const res = await call(method, path);
    expect([res.status, res.body.error?.code]).toEqual([403, 'SELLER_ACCOUNT_INACTIVE']);
  });
});

describe('an active kitchen', () => {
  beforeEach(() => seller.findUnique.mockResolvedValue({ id: 's1', status: 'active' }));

  it.each([
    ['POST', '/product-variants'],
    ['PATCH', '/product-variants/v1'],
    ['POST', '/promotions'],
    ['GET', '/promotions'],
  ])('is not stopped by the guard on %s %s', async (method, path) => {
    const res = await call(method, path);
    expect(res.body.error?.code).not.toBe('SELLER_ACCOUNT_INACTIVE');
    expect(res.status).not.toBe(403);
  });
});

describe('a kitchen whose status the database cannot give in time', () => {
  beforeEach(() =>
    seller.findUnique.mockRejectedValue(Object.assign(new Error('Timed out fetching a new connection from the connection pool'), { code: 'P2024', clientVersion: '6.0.0' }))
  );

  it('is told to try again (503 SERVICE_BUSY), not that it is suspended', async () => {
    const res = await call('POST', '/promotions');
    expect([res.status, res.body.error?.code]).toEqual([503, 'SERVICE_BUSY']);
  });
});

describe('requireSeller when the database cannot give the kitchen in time', () => {
  it('hands the database error on for a 503, not a 403 verification failure', async () => {
    const { requireSeller } = jest.requireActual('../src/middleware/auth.middleware');
    const timeout = Object.assign(new Error('Timed out fetching a new connection from the connection pool'), { code: 'P2024', clientVersion: '6.0.0' });
    seller.findUnique.mockRejectedValue(timeout);
    const next = jest.fn();
    await requireSeller({ user: { id: 'user-1', userType: 'seller' } }, {}, next);
    expect(next).toHaveBeenCalledWith(timeout);
  });
});
