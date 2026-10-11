/**
 * A category created in the admin screen had no kind of dish, so no kitchen could ever choose it (kitchens find a category
 * through the kind of dish they are adding). A top-level category has to say, a subcategory takes its parent's. The database
 * is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import categoryService from '../src/services/category.service';

beforeEach(() => {
  db.category = {
    findUnique: jest.fn(async ({ where }: any) => (where.id === 'parent-frozen' ? { productType: 'frozen' } : where.id === 'parent-untyped' ? { productType: null } : null)),
    create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
  };
  // findUnique is also used for the slug check: nothing exists under that slug
  const lookup = db.category.findUnique;
  db.category.findUnique = jest.fn(async (args: any) => (args.where.slug ? null : lookup(args)));
});

describe('creating a category', () => {
  it('keeps the kind of dish it is given', async () => {
    const made = await categoryService.createCategory({ name: 'Biryani & Rice', productType: 'fresh' });
    expect(made).toMatchObject({ productType: 'fresh', parentId: null });
  });

  it('refuses a top-level category with no kind of dish, and says why', async () => {
    await expect(categoryService.createCategory({ name: 'Tandoori & Grill' })).rejects.toMatchObject({ statusCode: 400, code: 'PRODUCT_TYPE_REQUIRED' });
    expect(db.category.create).not.toHaveBeenCalled();
  });

  it('gives a subcategory its parent\'s kind when it names none', async () => {
    const made = await categoryService.createCategory({ name: 'Plain Parathas', parentId: 'parent-frozen' });
    expect(made).toMatchObject({ productType: 'frozen', parentId: 'parent-frozen' });
  });

  it('refuses a subcategory when neither it nor its parent has a kind, or the parent does not exist', async () => {
    await expect(categoryService.createCategory({ name: 'Orphan', parentId: 'parent-untyped' })).rejects.toMatchObject({ code: 'PRODUCT_TYPE_REQUIRED' });
    await expect(categoryService.createCategory({ name: 'Lost', parentId: 'no-such-parent' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets a subcategory have a kind of its own', async () => {
    const made = await categoryService.createCategory({ name: 'Sweet Samosas', parentId: 'parent-frozen', productType: 'ready_to_eat' });
    expect(made.productType).toBe('ready_to_eat');
  });
});
