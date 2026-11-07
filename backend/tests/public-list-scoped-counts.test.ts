/**
 * The kitchens, categories and communities lists counted dishes, reviews and kitchens with Prisma's relation `_count`,
 * which aggregates the whole child table before joining. The counts now come from queries scoped to the ids being
 * listed, with the same numbers and response shape. The database is a double; what is under test is what each read asks.
 */
type Args = { where?: Record<string, unknown>; include?: Record<string, unknown> };

const db = {
  seller: { findMany: jest.fn(), groupBy: jest.fn() },
  product: { groupBy: jest.fn(), count: jest.fn() },
  review: { groupBy: jest.fn() },
  category: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), delete: jest.fn() },
  community: { findMany: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/product.service', () => ({ computeCustomerFacingSellerInfo: jest.fn() }));

import { listPublicSellers } from '../src/services/public-seller.service';
import categoryService from '../src/services/category.service';
import { communityService } from '../src/services/community.service';

beforeEach(() => {
  for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset();
});

const kitchen = (id: string, totalReviews: number) => ({
  id, businessName: id, ratingAverage: '4', totalReviews, trendScore: 0, status: 'active', scheduleMode: 'always',
  operatingHours: null, availabilityOverride: null, availabilityOverrideUntil: null, availabilityNote: null, minPrepTimeMinutes: 20,
  community: null, communityDeliveries: [], user: { profile: null }, products: [],
});

describe('the kitchens list', () => {
  it('counts on-menu dishes and approved reviews only for the kitchens on the page', async () => {
    db.seller.findMany.mockResolvedValue([kitchen('a', 0), kitchen('b', 9)]);
    db.product.groupBy.mockResolvedValue([{ sellerId: 'a', _count: { _all: 3 } }]);
    db.review.groupBy.mockResolvedValue([{ sellerId: 'a', _count: { _all: 2 } }]);

    const list = await listPublicSellers({});

    expect((db.seller.findMany.mock.calls[0][0] as Args).include).not.toHaveProperty('_count');
    const products = db.product.groupBy.mock.calls[0][0] as Args;
    expect(products.where).toMatchObject({ sellerId: { in: ['a', 'b'] }, isActive: true, approvalStatus: 'approved' });
    expect(products.where).toHaveProperty('OR');
    // only a kitchen with no stored review total falls back to counting
    expect((db.review.groupBy.mock.calls[0][0] as Args).where).toEqual({ sellerId: { in: ['a'] }, isApproved: true });
    expect(list.map((k) => [k.productCount, k.totalReviews])).toEqual([[3, 2], [0, 9]]);
  });

  it('asks nothing more when there are no kitchens', async () => {
    db.seller.findMany.mockResolvedValue([]);
    expect(await listPublicSellers({})).toEqual([]);
    expect(db.product.groupBy).not.toHaveBeenCalled();
    expect(db.review.groupBy).not.toHaveBeenCalled();
  });
});

const category = (id: string, parentId: string | null, productType = 'fresh') => ({ id, name: id, nameUrdu: null, slug: id, iconUrl: null, productType, parentId });

describe('the categories list', () => {
  beforeEach(() => {
    db.category.findMany.mockResolvedValue([category('root', null), category('child', 'root')]);
    db.product.groupBy.mockResolvedValue([{ categoryId: 'child', _count: { _all: 4 } }]);
  });

  it('counts dishes only for the listed categories and keeps the tree and its _count field', async () => {
    const tree = await categoryService.getCategories();

    expect((db.category.findMany.mock.calls[0][0] as Args).include).toBeUndefined();
    expect((db.product.groupBy.mock.calls[0][0] as Args).where).toEqual({ categoryId: { in: ['root', 'child'] } });
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'root', productCount: 0, _count: { products: 0 } });
    expect(tree[0].children[0]).toMatchObject({ id: 'child', productCount: 4, _count: { products: 4 } });
  });

  it('groups by kind of dish with the same counts', async () => {
    const grouped = await categoryService.getCategoriesByProductType();
    expect(grouped.fresh[0]).toMatchObject({ id: 'root', productCount: 0 });
    expect(grouped.fresh[0].children[0]).toMatchObject({ id: 'child', productCount: 4 });
  });

  it('counts one category\'s dishes on its page', async () => {
    db.category.findFirst.mockResolvedValue({ ...category('root', null), parent: null, children: [] });
    db.product.count.mockResolvedValue(7);

    const one = await categoryService.getCategoryByIdentifier('root');

    expect((db.category.findFirst.mock.calls[0][0] as Args).include).not.toHaveProperty('_count');
    expect(db.product.count).toHaveBeenCalledWith({ where: { categoryId: 'root' } });
    expect(one).toMatchObject({ productCount: 7, _count: { products: 7 } });
  });

  it('still refuses to delete a category that holds dishes or subcategories', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'root' });
    db.product.count.mockResolvedValue(1);
    db.category.count.mockResolvedValue(0);
    await expect(categoryService.deleteCategory('root')).rejects.toMatchObject({ code: 'CATEGORY_HAS_PRODUCTS' });

    db.product.count.mockResolvedValue(0);
    db.category.count.mockResolvedValue(2);
    await expect(categoryService.deleteCategory('root')).rejects.toMatchObject({ code: 'CATEGORY_HAS_CHILDREN' });
    expect(db.category.count).toHaveBeenCalledWith({ where: { parentId: 'root' } });
    expect(db.category.delete).not.toHaveBeenCalled();
  });
});

describe('the communities list', () => {
  it('counts verified active kitchens only for the listed communities', async () => {
    const area = (id: string) => ({ id, name: id, slug: id, city: 'Karachi', areaDescription: null, centerLatitude: '24.9', centerLongitude: '67.1', radiusKm: 3, neighborCommunityIds: [], crossCommunityEnabled: true, deliveryBaseFee: '50', crossCommunityBaseFee: '80' });
    db.community.findMany.mockResolvedValue([area('gulshan'), area('dha')]);
    db.seller.groupBy.mockResolvedValue([{ communityId: 'dha', _count: { _all: 5 } }]);

    const list = await communityService.getAllCommunities();

    expect((db.community.findMany.mock.calls[0][0] as Args).include).toBeUndefined();
    expect((db.seller.groupBy.mock.calls[0][0] as Args).where).toEqual({ communityId: { in: ['gulshan', 'dha'] }, isVerified: true, status: 'active' });
    expect(list.map((c) => [c.id, c.sellerCount])).toEqual([['gulshan', 0], ['dha', 5]]);
  });
});
