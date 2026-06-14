import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

// Roman-Urdu / spelling variants so "kabab" finds "kebab", "samosa" finds
// "samosay", etc. Each key maps to the set of forms treated as equivalent.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  kabab: ['kabab', 'kebab', 'kabob', 'kbab'],
  samosa: ['samosa', 'samosay', 'samose', 'samosas'],
  paratha: ['paratha', 'parantha', 'parata', 'prata'],
  biryani: ['biryani', 'biriyani', 'biryani', 'birani'],
  tikka: ['tikka', 'tika'],
  naan: ['naan', 'nan'],
  seekh: ['seekh', 'sikh', 'seek'],
  roti: ['roti', 'rotti'],
  nihari: ['nihari', 'nehari'],
  karahi: ['karahi', 'karhai', 'kadai', 'kadhai'],
};

// Bayesian-average tuning for the "top rated" sort: pull low-review products
// toward the global mean so a single 5★ rating can't outrank a well-reviewed 4.7★.
const BAYESIAN_PRIOR_MEAN = 4.0;
const BAYESIAN_CONFIDENCE = 8;

function expandSearchTerms(query: string): string[] {
  const lower = query.toLowerCase().trim();
  const terms = new Set<string>([lower]);
  for (const forms of Object.values(SEARCH_SYNONYMS)) {
    if (forms.some((f) => lower.includes(f))) {
      forms.forEach((f) => terms.add(f));
    }
  }
  return Array.from(terms);
}

// Shared include + derived row type for the compact product list card, used
// by both the catalog listing and the related-products section.
const LIST_INCLUDE = {
  category: { select: { id: true, name: true, nameUrdu: true, slug: true } },
  seller: {
    select: {
      id: true,
      businessName: true,
      businessNameUrdu: true,
      ratingAverage: true,
      isVerified: true,
    },
  },
  images: { where: { isPrimary: true }, take: 1, select: { imageUrl: true } },
  _count: { select: { reviews: true } },
} satisfies Prisma.ProductInclude;

type ProductListRow = Prisma.ProductGetPayload<{ include: typeof LIST_INCLUDE }>;

export class ProductService {
  /**
   * Get all products with filters and pagination
   */
  async getProducts(filters: {
    page?: number;
    limit?: number;
    categoryId?: string;
    sellerId?: string;
    city?: string;
    area?: string;
    minPrice?: number;
    maxPrice?: number;
    dietary?: string[];
    stockType?: string;
    productType?: string;  // frozen, fresh, ready_to_eat, ready_to_cook
    search?: string;
    sort?: string;
    isActive?: boolean;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Rank + filter in SQL so we can use trigram relevance and a Bayesian
    // rating sort, then hydrate the page with Prisma for the rich includes.
    const { ids, total } = await this.rankProductIds(filters, limit, skip);

    if (ids.length === 0) {
      return {
        products: [],
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    const hydrated = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: LIST_INCLUDE,
    });

    // Preserve the SQL ranking order (findMany with `in` does not guarantee it).
    const byId = new Map(hydrated.map((p) => [p.id, p]));
    const products = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

    return {
      products: products.map((p) => this.formatListItem(p)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Shape a hydrated product into the compact list-card payload. */
  private formatListItem(product: ProductListRow) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const imageUrl = product.images?.[0]?.imageUrl || null;
    return {
      id: product.id,
      name: product.name,
      nameUrdu: product.nameUrdu,
      slug: product.slug,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      unit: product.unit,
      unitUrdu: product.unitUrdu,
      ratingAverage: Number(product.ratingAverage),
      totalReviews: product.totalReviews,
      primaryImage: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `${baseUrl}${imageUrl}`) : null,
      category: product.category,
      seller: product.seller,
      stockQuantity: product.stockQuantity,
      stockType: product.stockType,
      productType: product.productType,
      shelfLifeHours: product.shelfLifeHours,
      preparationTime: product.preparationTime,
      isActive: product.isActive,
      createdAt: product.createdAt,
    };
  }

  /**
   * Rank and filter products in SQL. Returns the page of product ids in the
   * intended order plus the total match count. Used by getProducts so search
   * relevance (trigram) and Bayesian rating sorting can be expressed in SQL.
   */
  private async rankProductIds(
    filters: {
      categoryId?: string;
      sellerId?: string;
      minPrice?: number;
      maxPrice?: number;
      dietary?: string[];
      stockType?: string;
      productType?: string;
      search?: string;
      sort?: string;
      isActive?: boolean;
    },
    limit: number,
    offset: number
  ): Promise<{ ids: string[]; total: number }> {
    const conditions: Prisma.Sql[] = [];

    // Public catalog: only active, approved products unless an explicit
    // isActive override is passed (e.g. an admin/seller-scoped listing).
    conditions.push(
      filters.isActive === false
        ? Prisma.sql`is_active = false`
        : Prisma.sql`is_active = true`
    );
    conditions.push(Prisma.sql`approval_status = 'approved'`);

    if (filters.categoryId) conditions.push(Prisma.sql`category_id = ${filters.categoryId}`);
    if (filters.sellerId) conditions.push(Prisma.sql`seller_id = ${filters.sellerId}`);
    if (filters.minPrice != null) conditions.push(Prisma.sql`price >= ${filters.minPrice}`);
    if (filters.maxPrice != null) conditions.push(Prisma.sql`price <= ${filters.maxPrice}`);
    if (filters.stockType) conditions.push(Prisma.sql`stock_type = ${filters.stockType}`);
    if (filters.productType) conditions.push(Prisma.sql`product_type = ${filters.productType}`);
    if (filters.dietary && filters.dietary.length > 0) {
      conditions.push(Prisma.sql`dietary_info && ${filters.dietary}::text[]`);
    }

    // Relevance expression for search; 0 when not searching.
    let relevance: Prisma.Sql = Prisma.sql`0`;
    const search = filters.search?.trim();
    if (search) {
      const terms = expandSearchTerms(search);
      // Substring hits score highest; trigram similarity catches typos.
      const likeBonuses = terms.map(
        (t) => Prisma.sql`CASE
          WHEN name ILIKE ${'%' + t + '%'} THEN 0.9
          WHEN COALESCE(name_urdu, '') ILIKE ${'%' + t + '%'} THEN 0.8
          WHEN COALESCE(description, '') ILIKE ${'%' + t + '%'} THEN 0.4
          ELSE 0 END`
      );
      relevance = Prisma.sql`GREATEST(
        similarity(name, ${search}),
        word_similarity(${search}, name),
        similarity(COALESCE(name_urdu, ''), ${search}),
        ${Prisma.join(likeBonuses, ', ')}
      )`;
      conditions.push(Prisma.sql`(${relevance}) > 0.15`);
    }

    // Bayesian average rating keeps thinly-reviewed items from topping the list.
    const bayesian = Prisma.sql`((${BAYESIAN_CONFIDENCE} * ${BAYESIAN_PRIOR_MEAN}) + (rating_average * total_reviews))
      / (${BAYESIAN_CONFIDENCE} + total_reviews)`;

    let orderBy: Prisma.Sql;
    switch (filters.sort) {
      case 'price_low':
        orderBy = Prisma.sql`price ASC, created_at DESC`;
        break;
      case 'price_high':
        orderBy = Prisma.sql`price DESC, created_at DESC`;
        break;
      case 'popular':
        orderBy = Prisma.sql`total_orders DESC, ${bayesian} DESC`;
        break;
      case 'rating':
      case 'top_rated':
        orderBy = Prisma.sql`${bayesian} DESC, total_reviews DESC`;
        break;
      case 'newest':
        orderBy = Prisma.sql`created_at DESC`;
        break;
      default:
        // When searching, relevance leads; otherwise newest first.
        orderBy = search
          ? Prisma.sql`(${relevance}) DESC, total_orders DESC`
          : Prisma.sql`created_at DESC`;
    }

    const whereSql = Prisma.join(conditions, ' AND ');
    const rows = await prisma.$queryRaw<Array<{ id: string; total_count: bigint }>>(
      Prisma.sql`
        SELECT id, COUNT(*) OVER() AS total_count
        FROM products
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      `
    );

    return {
      ids: rows.map((r) => r.id),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    };
  }

  /**
   * Get product by ID or slug
   */
  async getProductByIdentifier(identifier: string) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        category: true,
        seller: {
          include: {
            user: {
              select: {
                phone: true,
              },
            },
          },
        },
        images: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
        tags: true,
        _count: {
          select: {
            reviews: true,
            orderItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Increment view count
    await prisma.product.update({
      where: { id: product.id },
      data: { viewsCount: { increment: 1 } },
    });

    // Format images with full URLs
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    
    return {
      ...product,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      costPrice: product.costPrice ? Number(product.costPrice) : null,
      ratingAverage: Number(product.ratingAverage),
      images: product.images.map((img) => ({
        ...img,
        imageUrl: img.imageUrl.startsWith('http') ? img.imageUrl : `${baseUrl}${img.imageUrl}`,
      })),
    };
  }

  /**
   * "Frequently bought together / you may also like" for a product.
   *
   * Primary signal is order co-occurrence (products that appear in the same
   * orders), which captures real buying patterns. When there isn't enough
   * order history yet, it backfills with popular products from the same
   * category so the section is never empty.
   */
  async getRelatedProducts(productId: string, limit = 8) {
    const cooccur = await prisma.$queryRaw<Array<{ product_id: string }>>(
      Prisma.sql`
        SELECT oi2.product_id, COUNT(*) AS freq
        FROM order_items oi1
        JOIN order_items oi2
          ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id
        JOIN products p ON p.id = oi2.product_id
        WHERE oi1.product_id = ${productId}
          AND p.is_active = true AND p.approval_status = 'approved'
        GROUP BY oi2.product_id
        ORDER BY freq DESC
        LIMIT ${limit}
      `
    );
    let ids = cooccur.map((r) => r.product_id);

    // Backfill from the same category by popularity when co-occurrence is thin.
    if (ids.length < limit) {
      const base = await prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });
      if (base?.categoryId) {
        const fill = await prisma.product.findMany({
          where: {
            categoryId: base.categoryId,
            isActive: true,
            approvalStatus: 'approved',
            id: { notIn: [productId, ...ids] },
          },
          orderBy: [{ totalOrders: 'desc' }, { ratingAverage: 'desc' }],
          take: limit - ids.length,
          select: { id: true },
        });
        ids = [...ids, ...fill.map((f) => f.id)];
      }
    }

    if (ids.length === 0) return { products: [] };

    const hydrated = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: LIST_INCLUDE,
    });
    const byId = new Map(hydrated.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

    return { products: ordered.map((p) => this.formatListItem(p)) };
  }

  /**
   * Create product (seller only)
   */
  async createProduct(sellerId: string, data: {
    name: string;
    nameUrdu?: string;
    description?: string;
    descriptionUrdu?: string;
    categoryId?: string;
    price: number;
    originalPrice?: number;
    costPrice?: number;  // Seller's cost to make/buy the product
    unit: string;
    unitUrdu?: string;
    weightGrams?: number;
    ingredients?: string;
    allergens?: string;
    dietaryInfo?: string[];
    storageDays?: number;
    heatingInstructions?: string;
    heatingInstructionsUrdu?: string;
    minOrderQuantity?: number;
    maxOrderQuantity?: number;
    stockQuantity: number;
    stockType: string;
    productType?: string;  // frozen, fresh, ready_to_eat, ready_to_cook
    shelfLifeHours?: number;  // For fresh items
    preparationTime?: number;  // Minutes for made-to-order items
    images?: string[];
    tags?: string[];
  }) {
    // Verify seller exists
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Generate slug
    const slug = this.generateSlug(data.name);

    // Check if slug exists
    const existingProduct = await prisma.product.findUnique({
      where: { slug },
    });

    if (existingProduct) {
      throw new AppError('Product with this name already exists', 409, 'PRODUCT_EXISTS');
    }

    // Create product - Products go live immediately, no admin approval needed
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        name: data.name,
        nameUrdu: data.nameUrdu,
        slug,
        description: data.description,
        descriptionUrdu: data.descriptionUrdu,
        categoryId: data.categoryId,
        price: data.price,
        originalPrice: data.originalPrice,
        costPrice: data.costPrice,  // Seller's cost for profit tracking
        unit: data.unit,
        unitUrdu: data.unitUrdu,
        weightGrams: data.weightGrams,
        ingredients: data.ingredients,
        allergens: data.allergens,
        dietaryInfo: data.dietaryInfo || [],
        storageDays: data.storageDays || 30,
        heatingInstructions: data.heatingInstructions,
        heatingInstructionsUrdu: data.heatingInstructionsUrdu,
        minOrderQuantity: data.minOrderQuantity || 1,
        maxOrderQuantity: data.maxOrderQuantity,
        stockQuantity: data.stockQuantity,
        stockType: data.stockType,
        productType: data.productType || 'frozen',  // Default to frozen for backward compatibility
        shelfLifeHours: data.shelfLifeHours,  // For fresh items
        preparationTime: data.preparationTime,  // For made-to-order items
        approvalStatus: 'approved', // Auto-approved - sellers can add products immediately
        isActive: true, // Active immediately - visible to customers
        images: data.images
          ? {
              create: data.images.map((url, index) => ({
                imageUrl: url,
                isPrimary: index === 0,
                sortOrder: index,
              })),
            }
          : undefined,
        tags: data.tags
          ? {
              create: data.tags.map((tag) => ({ tag })),
            }
          : undefined,
      },
      include: {
        category: true,
        images: true,
        tags: true,
      },
    });

    return product;
  }

  /**
   * Update product (seller only)
   */
  async updateProduct(productId: string, sellerId: string, data: any) {
    // Verify product belongs to seller
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        seller: {
          userId: sellerId,
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found or access denied', 404, 'PRODUCT_NOT_FOUND');
    }

    // If name changed, update slug
    let slug = product.slug;
    if (data.name && data.name !== product.name) {
      slug = this.generateSlug(data.name);
      // Check if new slug exists
      const existingProduct = await prisma.product.findFirst({
        where: {
          slug,
          id: { not: productId },
        },
      });
      if (existingProduct) {
        throw new AppError('Product with this name already exists', 409, 'PRODUCT_EXISTS');
      }
    }

    // Handle image updates
    if (data.images !== undefined) {
      // Delete existing images
      await prisma.productImage.deleteMany({
        where: { productId },
      });
      
      // Create new images if provided
      if (data.images && data.images.length > 0) {
        await prisma.productImage.createMany({
          data: data.images.map((url: string, index: number) => ({
            productId,
            imageUrl: url,
            isPrimary: index === 0,
            sortOrder: index,
          })),
        });
      }
      
      // Remove images from data to prevent Prisma error
      delete data.images;
    }

    // Update product - no re-approval needed
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        ...data,
        slug,
        // Keep current approval status and active state
        // Unless explicitly changed via isActive field
      },
      include: {
        category: true,
        images: true,
        tags: true,
      },
    });

    return updatedProduct;
  }

  /**
   * Delete product (seller only)
   */
  async deleteProduct(productId: string, sellerId: string) {
    // Verify product belongs to seller
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        seller: {
          userId: sellerId,
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found or access denied', 404, 'PRODUCT_NOT_FOUND');
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    return { message: 'Product deleted successfully' };
  }

  /**
   * Get seller's products
   */
  async getSellerProducts(sellerId: string, filters: {
    page?: number;
    limit?: number;
    isActive?: boolean;
    approvalStatus?: string;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const where: any = {
      sellerId: seller.id,
    };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          images: true,
          _count: {
            select: {
              reviews: true,
              orderItems: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Format products with full image URLs
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const formattedProducts = products.map((product) => ({
      ...product,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      images: product.images.map((img) => ({
        ...img,
        imageUrl: img.imageUrl.startsWith('http') ? img.imageUrl : `${baseUrl}${img.imageUrl}`,
      })),
    }));

    return {
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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

export default new ProductService();

