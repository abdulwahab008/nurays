import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

/** A category in the grouped tree: the fields the menus show, its subcategories and how many dishes it holds. */
export interface CategoryTreeNode {
  id: string;
  name: string;
  nameUrdu: string | null;
  slug: string;
  iconUrl: string | null;
  productType: string | null;
  parentId: string | null;
  children: CategoryTreeNode[];
  productCount: number;
}

// Relation _count aggregates the whole products table before joining; this counts only the categories asked about.
async function productCounts(categoryIds: string[]) {
  if (categoryIds.length === 0) return new Map<string, number>();
  const rows = await prisma.product.groupBy({ by: ['categoryId'], where: { categoryId: { in: categoryIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.categoryId as string, r._count._all]));
}

export class CategoryService {
  /**
   * Get all categories
   */
  async getCategories(includeInactive: boolean = false) {
    const categories = await prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
    const counts = await productCounts(categories.map((c) => c.id));

    // Build category tree
    type TreeNode = (typeof categories)[number] & { _count: { products: number }; children: TreeNode[]; productCount: number };
    const categoryMap = new Map<string, TreeNode>();
    const rootCategories: TreeNode[] = [];

    // First pass: create map
    categories.forEach((category) => {
      const products = counts.get(category.id) ?? 0;
      categoryMap.set(category.id, {
        ...category,
        _count: { products },
        children: [],
        productCount: products,
      });
    });

    // Second pass: build tree
    categories.forEach((category) => {
      const categoryNode = categoryMap.get(category.id);
      if (!categoryNode) return; // set in the first pass
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          rootCategories.push(categoryNode);
        }
      } else {
        rootCategories.push(categoryNode);
      }
    });

    return rootCategories;
  }

  /**
   * Get categories grouped by product type
   * Returns: { frozen: [...], fresh: [...], ready_to_eat: [...], ready_to_cook: [...] }
   */
  async getCategoriesByProductType(includeInactive: boolean = false) {
    const categories = await prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
    const counts = await productCounts(categories.map((c) => c.id));

    // Build category tree first
    const categoryMap = new Map<string, CategoryTreeNode>();
    const rootCategories: CategoryTreeNode[] = [];

    // First pass: create map
    categories.forEach((category) => {
      categoryMap.set(category.id, {
        id: category.id,
        name: category.name,
        nameUrdu: category.nameUrdu,
        slug: category.slug,
        iconUrl: category.iconUrl,
        productType: category.productType,
        parentId: category.parentId,
        children: [],
        productCount: counts.get(category.id) ?? 0,
      });
    });

    // Second pass: build tree
    categories.forEach((category) => {
      const categoryNode = categoryMap.get(category.id);
      if (!categoryNode) return; // set in the first pass
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryNode);
        } else {
          rootCategories.push(categoryNode);
        }
      } else {
        rootCategories.push(categoryNode);
      }
    });

    // Group root categories by productType
    const grouped = {
      frozen: rootCategories.filter(c => c.productType === 'frozen'),
      fresh: rootCategories.filter(c => c.productType === 'fresh'),
      ready_to_eat: rootCategories.filter(c => c.productType === 'ready_to_eat'),
      ready_to_cook: rootCategories.filter(c => c.productType === 'ready_to_cook'),
    };

    return grouped;
  }

  /**
   * Get category by ID or slug
   */
  async getCategoryByIdentifier(identifier: string) {
    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
        },
      },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    const products = await prisma.product.count({ where: { categoryId: category.id } });
    return {
      ...category,
      _count: { products },
      productCount: products,
    };
  }

  /**
   * Create category (admin only)
   */
  async createCategory(data: {
    name: string;
    nameUrdu?: string;
    description?: string;
    iconUrl?: string;
    parentId?: string;
    productType?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Generate slug
    const slug = this.generateSlug(data.name);

    // Check if slug exists
    const existingCategory = await prisma.category.findUnique({
      where: { slug },
    });

    if (existingCategory) {
      throw new AppError('Category with this name already exists', 409, 'CATEGORY_EXISTS');
    }

    // Kitchens find a category through the kind of dish they are adding, so a category with no kind can never be chosen. A
    // subcategory takes its parent's kind when none is given; a top-level one has to say.
    let productType = data.productType || null;
    if (!productType) {
      if (data.parentId) {
        const parent = await prisma.category.findUnique({ where: { id: data.parentId }, select: { productType: true } });
        if (!parent) throw new AppError('The parent category was not found', 404, 'CATEGORY_NOT_FOUND');
        productType = parent.productType;
      }
      if (!productType) {
        throw new AppError('Choose the kind of dish this category is for (fresh, ready to eat, ready to cook or frozen)', 400, 'PRODUCT_TYPE_REQUIRED');
      }
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        nameUrdu: data.nameUrdu,
        slug,
        description: data.description,
        iconUrl: data.iconUrl || null,
        parentId: data.parentId || null,
        productType,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return category;
  }

  /**
   * Update category (admin only)
   */
  async updateCategory(
    categoryId: string,
    data: { name?: string; nameUrdu?: string; description?: string; iconUrl?: string | null; parentId?: string | null; productType?: string | null; sortOrder?: number; isActive?: boolean }
  ) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // If name changed, update slug
    let slug = category.slug;
    if (data.name && data.name !== category.name) {
      slug = this.generateSlug(data.name);
      const existingCategory = await prisma.category.findFirst({
        where: {
          slug,
          id: { not: categoryId },
        },
      });
      if (existingCategory) {
        throw new AppError('Category with this name already exists', 409, 'CATEGORY_EXISTS');
      }
    }

    // Only these columns, never a relation write or an id from the request body.
    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.nameUrdu !== undefined ? { nameUrdu: data.nameUrdu } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.iconUrl !== undefined ? { iconUrl: data.iconUrl || null } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
        ...(data.productType !== undefined ? { productType: data.productType } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        slug,
      },
    });

    return updatedCategory;
  }

  /**
   * Delete category (admin only)
   */
  async deleteCategory(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    const [products, children] = await Promise.all([
      prisma.product.count({ where: { categoryId } }),
      prisma.category.count({ where: { parentId: categoryId } }),
    ]);

    if (products > 0) {
      throw new AppError('Cannot delete category with products', 400, 'CATEGORY_HAS_PRODUCTS');
    }

    if (children > 0) {
      throw new AppError('Cannot delete category with subcategories', 400, 'CATEGORY_HAS_CHILDREN');
    }

    await prisma.category.delete({
      where: { id: categoryId },
    });

    return { message: 'Category deleted successfully' };
  }

  /**
   * Generate URL-friendly slug
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export default new CategoryService();

