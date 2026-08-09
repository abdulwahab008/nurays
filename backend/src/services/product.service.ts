import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { computeSellerAvailability, isAcceptingOrders } from './availability.service';
import { getDeliveryFeeForSeller, haversineKm } from '../utils/deliveryFee';

const SELLER_AVAILABILITY_SELECT = {
  status: true,
  scheduleMode: true,
  operatingHours: true,
  availabilityOverride: true,
  availabilityOverrideUntil: true,
  availabilityNote: true,
} as const;

// Everything isAcceptingOrders/getDeliveryFeeForSeller need, on top of
// SELLER_AVAILABILITY_SELECT — selected once here so the customer-facing
// listing/detail endpoints can show real "Accepting Orders", delivery fee,
// distance, and ETA instead of guessing or hardcoding them.
const SELLER_ORDERING_SELECT = {
  id: true,
  orderCutoffTime: true,
  maxDailyOrders: true,
  preOrderOnly: true,
  minPrepTimeMinutes: true,
  latitude: true,
  longitude: true,
  freeDeliveryAreas: true,
  freeDeliveryRadiusKm: true,
  deliveryFeeType: true,
  deliveryFeeFixed: true,
  deliveryFeeBase: true,
  deliveryFeePerKm: true,
  distancePricingTiers: true,
  maxDeliveryDistanceKm: true,
  minOrderAmountForDelivery: true,
  freeDeliveryThreshold: true,
  allowedPostalCodes: true,
  deliveryZones: true,
  deliveryModes: true,
} as const;

function attachAvailability<T extends Record<string, unknown>>(seller: T) {
  const availability = computeSellerAvailability(seller as any);
  return {
    ...seller,
    availability: {
      status: availability.status,
      isOpen: availability.isOpen,
      opensAt: availability.opensAt,
      closesAt: availability.closesAt,
      nextOpenAt: availability.nextOpenAt,
      reason: availability.reason,
    },
  };
}

/**
 * A simple, honest delivery-time estimate — prep time plus travel time at an
 * assumed ~20km/h average urban delivery speed. Not a routing engine; this is
 * a customer-facing range, not a logistics guarantee.
 */
const FAST_DELIVERY_MAX_MINUTES = 45;

function estimateDeliveryMinutes(
  minPrepTimeMinutes: number | null | undefined,
  distanceKm: number | null
): { minMinutes: number; maxMinutes: number } {
  const prep = minPrepTimeMinutes ?? 20;
  if (distanceKm == null) {
    return { minMinutes: prep + 20, maxMinutes: prep + 45 };
  }
  const travel = Math.max(10, Math.round((distanceKm / 20) * 60));
  return { minMinutes: prep + travel, maxMinutes: prep + travel + 15 };
}

/**
 * Per-seller "what should the customer see" bundle: whether new orders are
 * actually being accepted right now (distinct from just isOpen — folds in
 * cutoff time and daily cap), and — only when we know where the customer is —
 * delivery fee, distance, eligibility, and an ETA.
 */
async function computeCustomerFacingSellerInfo(
  seller: Record<string, unknown> & {
    id: string;
    latitude: unknown;
    longitude: unknown;
    minPrepTimeMinutes: number | null;
  },
  customerLat?: number | null,
  customerLng?: number | null
) {
  const accepting = await isAcceptingOrders(seller as any);
  if (customerLat == null || customerLng == null) {
    return { isAcceptingOrders: accepting.accepting, acceptingReason: accepting.reason, delivery: null };
  }
  const feeResult = getDeliveryFeeForSeller(
    seller as any,
    { latitude: customerLat, longitude: customerLng },
    seller.latitude != null ? Number(seller.latitude) : null,
    seller.longitude != null ? Number(seller.longitude) : null
  );
  const eta = estimateDeliveryMinutes(seller.minPrepTimeMinutes, feeResult.distanceKm);
  return {
    isAcceptingOrders: accepting.accepting,
    acceptingReason: accepting.reason,
    delivery: {
      deliverable: feeResult.deliverable,
      fee: feeResult.fee,
      distanceKm: feeResult.distanceKm != null ? Math.round(feeResult.distanceKm * 10) / 10 : null,
      reason: feeResult.reason,
      estimatedMinMinutes: eta.minMinutes,
      estimatedMaxMinutes: eta.maxMinutes,
    },
  };
}

// Common Roman-Urdu food terms mapped to their English equivalents / spelling variants,
// so a search for "murgh" also matches products named "chicken", etc.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  murgh: ['chicken'],
  morgh: ['chicken'],
  moorg: ['chicken'],
  gosht: ['mutton', 'beef', 'meat'],
  bakra: ['mutton', 'goat'],
  machli: ['fish'],
  machhli: ['fish'],
  sabzi: ['vegetable'],
  subzi: ['vegetable'],
  kabab: ['kebab'],
  kebab: ['kabab'],
  shami: ['shaami'],
  shaami: ['shami'],
  handi: ['karahi'],
  karahi: ['handi', 'kadai'],
  keema: ['qeema', 'mince'],
  qeema: ['keema', 'mince'],
  aloo: ['potato'],
  daal: ['dal', 'lentil'],
  dal: ['daal', 'lentil'],
  paratha: ['parantha'],
  parantha: ['paratha'],
  biryani: ['biriyani', 'briyani'],
  biriyani: ['biryani'],
  roti: ['bread', 'chapati'],
  chapati: ['roti'],
  anda: ['egg'],
  dahi: ['yogurt', 'yoghurt'],
  doodh: ['milk'],
};

/** Expand a search string into itself plus any Roman-Urdu/English synonym terms for its words. */
function expandSearchTerms(search: string): string[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const terms = new Set<string>([search]);
  for (const word of words) {
    for (const synonym of SEARCH_SYNONYMS[word] ?? []) {
      terms.add(synonym);
    }
  }
  return Array.from(terms);
}

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
    mealCategory?: string;
    openNow?: boolean;
    open247?: boolean;
    deliveryAvailable?: boolean;
    pickupAvailable?: boolean;
    offersAvailable?: boolean;
    freeDelivery?: boolean;
    businessType?: string; // restaurant, home_kitchen, bakery, cafe, cloud_kitchen
    preOrderOnly?: boolean;
    currentlyBusy?: boolean;
    newKitchens?: boolean; // seller registered within the last 30 days
    fastDelivery?: boolean; // estimated max delivery time under FAST_DELIVERY_MAX_MINUTES
    // When present, distance/fee/ETA are computed and attached per product;
    // combined with maxDistanceKm, also filters out sellers beyond that range.
    customerLat?: number;
    customerLng?: number;
    maxDistanceKm?: number;
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
    // Public catalog: never show a product that hasn't cleared admin moderation,
    // regardless of its isActive flag. Admin-only listing lives in admin.service.ts.
    where.approvalStatus = 'approved';
    // ...nor a product from a suspended/inactive seller.
    where.seller = { status: 'active' };

    if (filters.mealCategory) {
      where.seller.mealCategories = { has: filters.mealCategory };
    }
    const requiredDeliveryModes: string[] = [];
    if (filters.deliveryAvailable) requiredDeliveryModes.push('delivery');
    if (filters.pickupAvailable) requiredDeliveryModes.push('pickup');
    if (requiredDeliveryModes.length > 0) {
      // hasEvery (not two separate assignments) so requesting both
      // deliveryAvailable and pickupAvailable together actually requires
      // both, instead of the second filter silently overwriting the first.
      where.seller.deliveryModes = { hasEvery: requiredDeliveryModes };
    }
    if (filters.offersAvailable) {
      const now = new Date();
      where.seller.promotions = { some: { isActive: true, validFrom: { lte: now }, validUntil: { gte: now } } };
    }
    if (filters.freeDelivery) {
      // Coarse "offers free delivery to somewhere" signal — a specific address's
      // eligibility still needs the real per-address check in deliveryFee.ts.
      where.seller.freeDeliveryRadiusKm = { not: null };
    }
    if (filters.open247) {
      where.seller.scheduleMode = '24_7';
    }
    if (filters.businessType) {
      where.seller.businessType = filters.businessType;
    }
    if (filters.preOrderOnly) {
      where.seller.preOrderOnly = true;
    }
    if (filters.currentlyBusy) {
      where.seller.availabilityOverride = 'busy';
    }
    if (filters.newKitchens) {
      where.seller.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    if (filters.search) {
      where.OR = expandSearchTerms(filters.search).flatMap((term) => [
        { name: { contains: term, mode: 'insensitive' } },
        { nameUrdu: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ]);
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

    const productInclude = {
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
          businessName: true,
          businessNameUrdu: true,
          businessType: true,
          ratingAverage: true,
          isVerified: true,
          mealCategories: true,
          createdAt: true,
          ...SELLER_AVAILABILITY_SELECT,
          ...SELLER_ORDERING_SELECT,
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
    } as const;

    const hasCustomerLocation = filters.customerLat != null && filters.customerLng != null;
    const needsInMemoryFilter =
      !!filters.openNow || !!filters.fastDelivery || (filters.maxDistanceKm != null && hasCustomerLocation);

    // "Open now" and "within X km" can't be expressed as DB predicates (per-day
    // sessions and haversine distance both need real computation), so when
    // requested we pull a larger candidate window, filter in JS, then paginate
    // the filtered set ourselves. Fine at this app's data volume; would need a
    // materialized "is_open" column / PostGIS to scale further.
    let products: Array<Awaited<ReturnType<typeof prisma.product.findMany<{ where: typeof where; include: typeof productInclude; orderBy: typeof orderBy }>>>[number]>;
    let total: number;

    if (needsInMemoryFilter) {
      const candidates = await prisma.product.findMany({
        where,
        orderBy,
        include: productInclude,
        take: 500,
      });
      const filtered = candidates.filter((p) => {
        if (filters.openNow && !computeSellerAvailability(p.seller as any).isOpen) return false;
        if (filters.maxDistanceKm != null && hasCustomerLocation) {
          const seller = p.seller as any;
          if (seller.latitude == null || seller.longitude == null) return false;
          const distanceKm = haversineKm(
            filters.customerLat!,
            filters.customerLng!,
            Number(seller.latitude),
            Number(seller.longitude)
          );
          if (distanceKm > filters.maxDistanceKm) return false;
        }
        if (filters.fastDelivery) {
          const seller = p.seller as any;
          const distanceKm =
            hasCustomerLocation && seller.latitude != null && seller.longitude != null
              ? haversineKm(filters.customerLat!, filters.customerLng!, Number(seller.latitude), Number(seller.longitude))
              : null;
          const eta = estimateDeliveryMinutes(seller.minPrepTimeMinutes, distanceKm);
          if (eta.maxMinutes > FAST_DELIVERY_MAX_MINUTES) return false;
        }
        return true;
      });
      total = filtered.length;
      products = filtered.slice(skip, skip + limit);
    } else {
      [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: productInclude,
        }),
        prisma.product.count({ where }),
      ]);
    }

    // Compute accepting-orders/delivery-fee/distance/ETA once per UNIQUE seller
    // in this page of results, not once per product, to avoid redundant work
    // (and the DB query isAcceptingOrders makes) when several products share a seller.
    const sellerInfoById = new Map<string, Awaited<ReturnType<typeof computeCustomerFacingSellerInfo>>>();
    for (const product of products) {
      const seller = product.seller as any;
      if (!sellerInfoById.has(seller.id)) {
        sellerInfoById.set(
          seller.id,
          await computeCustomerFacingSellerInfo(seller, filters.customerLat, filters.customerLng)
        );
      }
    }

    // Format products
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const formattedProducts = products.map((product) => {
      const imageUrl = product.images[0]?.imageUrl || null;
      const sellerInfo = sellerInfoById.get((product.seller as any).id)!;
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
        seller: {
          ...attachAvailability(product.seller),
          isAcceptingOrders: sellerInfo.isAcceptingOrders,
          acceptingOrdersReason: sellerInfo.acceptingReason,
        },
        delivery: sellerInfo.delivery,
        estimatedDeliveryMinMinutes: sellerInfo.delivery?.estimatedMinMinutes ?? null,
        estimatedDeliveryMaxMinutes: sellerInfo.delivery?.estimatedMaxMinutes ?? null,
        minOrderAmountForDelivery: (product.seller as any).minOrderAmountForDelivery != null
          ? Number((product.seller as any).minOrderAmountForDelivery)
          : null,
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
   * Get product by ID or slug. Public visitors only ever see approved
   * products from active sellers; the product's own seller can always see
   * it regardless of moderation state (so they can view/edit a pending or
   * rejected listing on their own dashboard).
   */
  async getProductByIdentifier(
    identifier: string,
    requestingUserId?: string,
    customerLat?: number,
    customerLng?: number
  ) {
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
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            reviews: true,
            orderItems: true,
          },
        },
      },
    });

    const isOwner = requestingUserId != null && product?.seller.userId === requestingUserId;
    const isPubliclyVisible = product?.approvalStatus === 'approved' && product?.seller.status === 'active';

    if (!product || (!isPubliclyVisible && !isOwner)) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Increment view count
    await prisma.product.update({
      where: { id: product.id },
      data: { viewsCount: { increment: 1 } },
    });

    // Format images with full URLs
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const sellerInfo = await computeCustomerFacingSellerInfo(product.seller as any, customerLat, customerLng);

    return {
      ...product,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      costPrice: product.costPrice ? Number(product.costPrice) : null,
      ratingAverage: Number(product.ratingAverage),
      seller: {
        ...attachAvailability(product.seller),
        isAcceptingOrders: sellerInfo.isAcceptingOrders,
        acceptingOrdersReason: sellerInfo.acceptingReason,
      },
      delivery: sellerInfo.delivery,
      estimatedDeliveryMinMinutes: sellerInfo.delivery?.estimatedMinMinutes ?? null,
      estimatedDeliveryMaxMinutes: sellerInfo.delivery?.estimatedMaxMinutes ?? null,
      minOrderAmountForDelivery: product.seller.minOrderAmountForDelivery != null
        ? Number(product.seller.minOrderAmountForDelivery)
        : null,
      images: product.images.map((img) => ({
        ...img,
        imageUrl: img.imageUrl.startsWith('http') ? img.imageUrl : `${baseUrl}${img.imageUrl}`,
      })),
      variants: product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        nameUrdu: v.nameUrdu,
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        stockQuantity: v.stockQuantity,
        isDefault: v.isDefault,
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

    // Create product - awaits admin moderation before it appears on the public catalog
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
        approvalStatus: 'pending', // Awaits admin moderation
        isActive: false, // Not visible to customers until approved
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

