import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    // Build category tree
    const categoryMap = new Map();
    const rootCategories: any[] = [];

    // First pass: create map
    categories.forEach((category) => {
      categoryMap.set(category.id, {
        ...category,
        children: [],
        productCount: category._count.products,
      });
    });

    // Second pass: build tree
    categories.forEach((category) => {
      const categoryNode = categoryMap.get(category.id);
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
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    // Build category tree first
    const categoryMap = new Map();
    const rootCategories: any[] = [];

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
        productCount: category._count.products,
      });
    });

    // Second pass: build tree
    categories.forEach((category) => {
      const categoryNode = categoryMap.get(category.id);
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
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    return {
      ...category,
      productCount: category._count.products,
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

    const category = await prisma.category.create({
      data: {
        name: data.name,
        nameUrdu: data.nameUrdu,
        slug,
        description: data.description,
        iconUrl: data.iconUrl || null,
        parentId: data.parentId || null,
        productType: data.productType || null,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });

    return category;
  }

  /**
   * Update category (admin only)
   */
  async updateCategory(categoryId: string, data: any) {
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

    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...data,
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
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    if (category._count.products > 0) {
      throw new AppError('Cannot delete category with products', 400, 'CATEGORY_HAS_PRODUCTS');
    }

    if (category._count.children > 0) {
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

