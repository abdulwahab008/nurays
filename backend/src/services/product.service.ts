import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { computeSellerAvailability, isAcceptingOrders } from './availability.service';
import { getDeliveryFeeForSeller, haversineKm } from '../utils/deliveryFee';
import { SELLER_COMMUNITY_DELIVERY_SELECT } from '../utils/sellerDeliverySelect';
import { isUploadedBy } from '../utils/uploadPaths';

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
  primaryCommunityName: true,
  communityId: true,
  allowCrossCommunity: true,
  communityDeliveries: SELLER_COMMUNITY_DELIVERY_SELECT.communityDeliveries,
  community: {
    select: {
      id: true,
      name: true,
      slug: true,
      deliveryBaseFee: true,
      crossCommunityEnabled: true,
    },
  },
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
  customerLng?: number | null,
  customerCommunityId?: string | null
) {
  const accepting = await isAcceptingOrders(seller as any);
  if ((customerLat == null || customerLng == null) && !customerCommunityId) {
    return { isAcceptingOrders: accepting.accepting, acceptingReason: accepting.reason, delivery: null };
  }
  const feeResult = getDeliveryFeeForSeller(
    seller as any,
    { latitude: customerLat, longitude: customerLng, communityId: customerCommunityId },
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
    communityId?: string;
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
    const targetCommunity = filters.communityId
      ? await prisma.community.findFirst({
          where: { OR: [{ id: filters.communityId }, { slug: filters.communityId }] },
        })
      : null;

    const needsInMemoryFilter =
      !!filters.openNow || !!filters.fastDelivery || !!targetCommunity || (filters.maxDistanceKm != null && hasCustomerLocation);

    // "Open now", "within X km", and community-priority can't be expressed as simple DB predicates,
    // so when requested we pull a candidate window, filter/sort in JS, then paginate.
    let products: Array<Awaited<ReturnType<typeof prisma.product.findMany<{ where: typeof where; include: typeof productInclude; orderBy: typeof orderBy }>>>[number]>;
    let total: number;

    if (needsInMemoryFilter) {
      const candidates = await prisma.product.findMany({
        where,
        orderBy,
        include: productInclude,
        take: 500,
      });
      let filtered = candidates.filter((p) => {
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

      // Priority sort by Community:
      // Tier 1: Same community (Score 100)
      // Tier 2: Neighbor communities (Score 50)
      // Tier 3: Other serviceable communities (Score 10)
      if (targetCommunity && (!filters.sort || filters.sort === 'popular')) {
        filtered = filtered.sort((a, b) => {
          const sellerA = a.seller as any;
          const sellerB = b.seller as any;
          const scoreA =
            sellerA.communityId === targetCommunity.id
              ? 100
              : targetCommunity.neighborCommunityIds.includes(sellerA.communityId)
              ? 50
              : 10;
          const scoreB =
            sellerB.communityId === targetCommunity.id
              ? 100
              : targetCommunity.neighborCommunityIds.includes(sellerB.communityId)
              ? 50
              : 10;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return Number(b.ratingAverage) - Number(a.ratingAverage);
        });
      }

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
    const uniqueSellers = Array.from(
      new Map(products.map((p) => [(p.seller as any).id, p.seller as any])).values()
    );
    await Promise.all(
      uniqueSellers.map(async (seller) => {
        const info = await computeCustomerFacingSellerInfo(seller, filters.customerLat, filters.customerLng, targetCommunity?.id);
        sellerInfoById.set(seller.id, info);
      })
    );

    // Format products
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const formattedProducts = products.map((product) => {
      const imageUrl = product.images[0]?.imageUrl || null;
      const seller = product.seller as any;
      const sellerInfo = sellerInfoById.get(seller.id)!;
      const sellerCommunity = seller.community || (seller.primaryCommunityName ? { name: seller.primaryCommunityName } : null);

      let communityBadge = 'Community Seller';
      let isSameCommunity = false;
      let isCrossCommunity = false;

      if (targetCommunity) {
        if (seller.communityId === targetCommunity.id) {
          communityBadge = 'Same Community';
          isSameCommunity = true;
        } else if (targetCommunity.neighborCommunityIds.includes(seller.communityId)) {
          communityBadge = 'Nearby Community';
          isCrossCommunity = true;
        } else {
          communityBadge = 'Cross-Community';
          isCrossCommunity = true;
        }
      }

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
        community: sellerCommunity,
        communityBadge,
        isSameCommunity,
        isCrossCommunity,
        seller: {
          ...attachAvailability(product.seller),
          community: sellerCommunity,
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
    customerLng?: number,
    customerCommunityIdOrSlug?: string
  ) {
    // The listing page accepts an id or a slug; the delivery check below compares ids.
    let customerCommunityId: string | undefined;
    if (customerCommunityIdOrSlug) {
      const c = await prisma.community.findFirst({
        where: { OR: [{ id: customerCommunityIdOrSlug }, { slug: customerCommunityIdOrSlug }] },
        select: { id: true },
      });
      customerCommunityId = c?.id;
    }
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
            community: { select: { id: true, name: true, slug: true, crossCommunityEnabled: true } },
            communityDeliveries: SELLER_COMMUNITY_DELIVERY_SELECT.communityDeliveries,
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
    const sellerInfo = await computeCustomerFacingSellerInfo(product.seller as any, customerLat, customerLng, customerCommunityId);

    // This endpoint is public. `product.seller` is the full Seller row (bank and
    // wallet numbers, commission rate, home coordinates, the seller's phone), so
    // expose only an explicit public subset, and the product's cost price only
    // to its owner.
    const { seller: fullSeller, costPrice: rawCostPrice, ...productFields } = product;
    const publicSeller = {
      id: fullSeller.id,
      businessName: fullSeller.businessName,
      businessNameUrdu: fullSeller.businessNameUrdu,
      description: fullSeller.description,
      coverImageUrl: fullSeller.coverImageUrl,
      ratingAverage: fullSeller.ratingAverage,
      totalReviews: fullSeller.totalReviews,
      isVerified: fullSeller.isVerified,
      businessType: fullSeller.businessType,
      mealCategories: fullSeller.mealCategories,
      status: fullSeller.status,
      deliveryModes: fullSeller.deliveryModes,
      freeDeliveryThreshold: fullSeller.freeDeliveryThreshold,
      minOrderAmountForDelivery: fullSeller.minOrderAmountForDelivery,
      communityId: fullSeller.communityId,
      allowCrossCommunity: fullSeller.allowCrossCommunity,
      primaryCommunityName: fullSeller.primaryCommunityName,
      community: fullSeller.community,
      scheduleMode: fullSeller.scheduleMode,
      operatingHours: fullSeller.operatingHours,
      availabilityOverride: fullSeller.availabilityOverride,
      availabilityOverrideUntil: fullSeller.availabilityOverrideUntil,
      availabilityNote: fullSeller.availabilityNote,
      orderCutoffTime: fullSeller.orderCutoffTime,
      maxDailyOrders: fullSeller.maxDailyOrders,
      preOrderOnly: fullSeller.preOrderOnly,
      minPrepTimeMinutes: fullSeller.minPrepTimeMinutes,
    };

    return {
      ...productFields,
      price: Number(product.price),
      originalPrice: product.originalPrice ? Number(product.originalPrice) : null,
      ...(isOwner ? { costPrice: rawCostPrice ? Number(rawCostPrice) : null } : {}),
      ratingAverage: Number(product.ratingAverage),
      seller: {
        ...attachAvailability(publicSeller),
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

    // Generate a slug that is unique across the whole catalog. Another seller may
    // legitimately sell "Biryani" too, so a clash with someone else's product gets a
    // suffix; only a duplicate within the seller's own products is an error.
    if (data.images?.length) await this.assertImageUrlsAllowed(data.images, sellerId, seller.id);

    // Create product - awaits admin moderation before it appears on the public catalog
    const createRow = (slug: string) => prisma.product.create({
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

    // The slug check and the insert aren't atomic: two requests for the same name can
    // pick the same slug, and the unique index then rejects one — which just draws again.
    for (let attempt = 1; ; attempt++) {
      const slug = await this.uniqueSlug(data.name, seller.id);
      try {
        return await createRow(slug);
      } catch (err: any) {
        const target = String(err?.meta?.target ?? '');
        if (err?.code !== 'P2002' || !/slug/i.test(target) || attempt >= 5) throw err;
      }
    }
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
      slug = await this.uniqueSlug(data.name, product.sellerId, productId);
    }

    // Handle image updates
    if (data.images !== undefined) {
      if (data.images?.length) await this.assertImageUrlsAllowed(data.images, sellerId, product.sellerId);
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
   * Product image links must be ones the seller may attach. A link into our own /uploads is only
   * accepted if the seller uploaded that file (named "<theirUserId>_...") or it is already attached
   * to one of THEIR products (legacy files predate owner-named uploads). Otherwise a seller could
   * attach another seller's image path to their own product — the public product page shows the
   * filename — and then use the "delete my own product image" endpoint to unlink the victim's file.
   * Links to other sites are fine (nothing local can be deleted through them).
   */
  private async assertImageUrlsAllowed(urls: string[], userId: string, sellerId: string) {
    const local: string[] = [];
    for (const url of urls) {
      let path = url;
      if (/^https?:\/\//i.test(url)) {
        try {
          path = new URL(url).pathname;
        } catch {
          throw new AppError('Invalid image link', 400, 'INVALID_IMAGE_URL');
        }
      }
      if (path.startsWith('/uploads/')) local.push(path);
      else if (!/^https?:\/\//i.test(url)) {
        throw new AppError('Invalid image link', 400, 'INVALID_IMAGE_URL');
      }
    }
    if (local.length === 0) return;

    const foreign = local.filter((p) => !isUploadedBy(p, userId));
    if (foreign.length === 0) return;
    const mine = await prisma.productImage.findMany({
      where: { product: { sellerId }, OR: foreign.flatMap((p) => [{ imageUrl: p }, { imageUrl: { endsWith: p } }]) },
      select: { imageUrl: true },
    });
    const owned = new Set(mine.flatMap((m) => foreign.filter((p) => m.imageUrl === p || m.imageUrl.endsWith(p))));
    if (foreign.some((p) => !owned.has(p))) {
      throw new AppError('You can only use images you uploaded', 403, 'IMAGE_NOT_OWNED');
    }
  }

  /**
   * A slug no other product uses. Throws PRODUCT_EXISTS only when the same seller
   * already has a product with this name; a clash with another seller's product (or a
   * name with no URL-safe characters, e.g. Urdu-only) gets a short random suffix.
   */
  private async uniqueSlug(name: string, sellerId: string, excludeProductId?: string): Promise<string> {
    const base = this.generateSlug(name) || 'product';
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = attempt === 0 && this.generateSlug(name) ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const clash = await prisma.product.findFirst({
        where: { slug: candidate, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
        select: { sellerId: true },
      });
      if (!clash) return candidate;
      if (clash.sellerId === sellerId && attempt === 0) {
        throw new AppError('Product with this name already exists', 409, 'PRODUCT_EXISTS');
      }
    }
    throw new AppError('Could not generate a unique product URL; try a different name', 409, 'PRODUCT_EXISTS');
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

