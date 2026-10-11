/**
 * "Hide from store" and "Publish to store" on a kitchen's dish list answered "updated" and changed nothing: the update schema
 * dropped isActive. A kitchen can hide a dish at any time and show it again; showing a dish that was never approved is refused,
 * because only the administrator's approval makes a new dish visible. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));

import { updateProductSchema } from '../src/validators/product.validator';
import productService from '../src/services/product.service';

describe('the update schema', () => {
  it('keeps isActive when a kitchen sends it, and still drops what a kitchen must not set', () => {
    const parsed = updateProductSchema.parse({ isActive: false, approvalStatus: 'approved', sellerId: 'x', price: 99 });
    expect(parsed).toEqual({ isActive: false, price: 99 });
  });

  it('accepts only true or false', () => {
    expect(updateProductSchema.safeParse({ isActive: 'false' }).success).toBe(false);
    expect(updateProductSchema.safeParse({ isActive: null }).success).toBe(false);
  });
});

function givenProduct(over: Record<string, unknown>) {
  const product = { id: 'p1', sellerId: 's1', name: 'Karahi', slug: 'karahi', description: 'x', approvalStatus: 'approved', isActive: true, ...over };
  db.product = { findFirst: jest.fn(async () => product), update: jest.fn(async ({ data }: any) => ({ ...product, ...data, category: null, images: [], tags: [] })) };
  db.productImage = { findMany: jest.fn(async () => []), deleteMany: jest.fn(), createMany: jest.fn() };
  return product;
}

describe('a kitchen hiding and showing a dish', () => {
  it('can hide an approved dish, and the change reaches the database', async () => {
    givenProduct({});
    await productService.updateProduct('p1', 'u1', { isActive: false });
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }));
  });

  it('can show it again', async () => {
    givenProduct({ isActive: false });
    await productService.updateProduct('p1', 'u1', { isActive: true });
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: true }) }));
  });

  it('saves an edit of a dish under review that the edit form sends as "on" (it already is), without refusing it', async () => {
    givenProduct({ approvalStatus: 'pending', isActive: true });
    await productService.updateProduct('p1', 'u1', { isActive: true, price: 560 });
    expect(db.product.update).toHaveBeenCalled();
  });

  it('can hide a dish that waits for approval or was rejected, but cannot show one that is off', async () => {
    for (const approvalStatus of ['pending', 'rejected']) {
      givenProduct({ approvalStatus, isActive: false });
      await expect(productService.updateProduct('p1', 'u1', { isActive: true })).rejects.toMatchObject({ statusCode: 409, code: 'PRODUCT_NOT_APPROVED' });
      expect(db.product.update).not.toHaveBeenCalled();
      givenProduct({ approvalStatus, isActive: true });
      await productService.updateProduct('p1', 'u1', { isActive: false });
      expect(db.product.update).toHaveBeenCalled();
    }
  });
});
