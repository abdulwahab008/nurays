import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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

    // Build where clause
    const where: any = {};

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.sellerId) {
      where.sellerId = filters.sellerId;
    }

    if (filters.minPrice || filters.maxPrice) {
      where.price = {};
      if (filters.minPrice) where.price.gte = filters.minPrice;
      if (filters.maxPrice) where.price.lte = filters.maxPrice;
    }

    if (filters.dietary && filters.dietary.length > 0) {
      where.dietaryInfo = {
        hasSome: filters.dietary,
      };
    }

    if (filters.stockType) {
      where.stockType = filters.stockType;
    }

    if (filters.productType) {
      where.productType = filters.productType;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    } else {
      where.isActive = true;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { nameUrdu: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
    if (filters.sort) {
      switch (filters.sort) {
        case 'popular':
          orderBy = { totalOrders: 'desc' };
          break;
        case 'newest':
          orderBy = { createdAt: 'desc' };
          break;
        case 'price_low':
          orderBy = { price: 'asc' };
          break;
        case 'price_high':
          orderBy = { price: 'desc' };
          break;
        case 'rating':
          orderBy = { ratingAverage: 'desc' };
          break;
        default:
          orderBy = { createdAt: 'desc' };
      }
    }

    // Get products
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              nameUrdu: true,
              slug: true,
            },
          },
          seller: {
            select: {
              id: true,
              businessName: true,
              businessNameUrdu: true,
              ratingAverage: true,
              isVerified: true,
            },
          },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: {
              imageUrl: true,
            },
          },
          _count: {
            select: {
              reviews: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Format products
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const formattedProducts = products.map((product) => {
      const imageUrl = product.images[0]?.imageUrl || null;
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
    });

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

