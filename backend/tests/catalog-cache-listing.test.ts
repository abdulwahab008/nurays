/**
 * The listing's product COUNT(*) is cached per filter for a few seconds, and every product write that changes what the
 * public catalogue shows (edit, delete, approve or reject) bumps the catalogue version so the next listing counts again.
 * Redis is an in-memory double; the database is a double that counts queries.
 */

const fakeRedis = {
  store: new Map<string, string>(),
  failing: false,
  mget: async (...keys: string[]) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    return keys.map((k) => fakeRedis.store.get(k) ?? null);
  },
  set: async (key: string, value: string) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    fakeRedis.store.set(key, value);
    return 'OK';
  },
  incr: async (key: string) => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    const next = Number(fakeRedis.store.get(key) ?? 0) + 1;
    fakeRedis.store.set(key, String(next));
    return next;
  },
};
jest.mock('../src/config/redis', () => ({ getRedis: () => fakeRedis }));

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    community: { findFirst: jest.fn() },
    seller: { findMany: jest.fn() },
    product: {
      count: jest.fn(async () => 3),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(async () => ({})),
    },
  },
}));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/ranking.service', () => ({ searchRankedProductIds: jest.fn() }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notifySeller: jest.fn(), notify: jest.fn() }));
jest.mock('../src/storage', () => ({ isStoredFile: jest.fn(), presentFile: jest.fn() }));

import prisma from '../src/config/database';
import { ProductService } from '../src/services/product.service';
import adminService from '../src/services/admin.service';

const db = prisma as unknown as {
  product: { count: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
};
const products = new ProductService();
const settle = () => new Promise((r) => setImmediate(r));

const DISH = { id: 'p1', sellerId: 's1', name: 'Chicken Karahi', slug: 'chicken-karahi', isActive: true, approvalStatus: 'approved', price: 500, menuType: 'fixed' };

beforeEach(() => {
  fakeRedis.store.clear();
  fakeRedis.failing = false;
  db.product.findFirst.mockResolvedValue(DISH);
  db.product.findUnique.mockResolvedValue(DISH);
  db.product.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...DISH, ...data }));
});

describe('listing count cache', () => {
  it('counts once per filter, and counts each filter apart', async () => {
    expect((await products.getProducts({ categoryId: 'c1' })).pagination.total).toBe(3);
    await settle();
    expect((await products.getProducts({ categoryId: 'c1', page: 2 })).pagination.total).toBe(3);
    expect(db.product.count).toHaveBeenCalledTimes(1);

    await products.getProducts({ categoryId: 'c2' });
    expect(db.product.count).toHaveBeenCalledTimes(2);
  });

  it('still counts from the database when Redis is down', async () => {
    fakeRedis.failing = true;
    await products.getProducts({ categoryId: 'c1' });
    await products.getProducts({ categoryId: 'c1' });
    expect(db.product.count).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a kitchen edits a dish', () => products.updateProduct('p1', 'seller-user', { price: 450 })],
    ['a kitchen deletes a dish', () => products.deleteProduct('p1', 'seller-user')],
    ['an admin approves a dish', () => adminService.moderateProduct('p1', 'admin1', true)],
    ['an admin rejects a dish', () => adminService.moderateProduct('p1', 'admin1', false, 'Blurry photo')],
  ])('counts again after %s', async (_what, write) => {
    await products.getProducts({ categoryId: 'c1' });
    await settle();
    await write();
    await products.getProducts({ categoryId: 'c1' });
    expect(db.product.count).toHaveBeenCalledTimes(2);
  });
});
