import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { searchTerm } from '../utils/search';
import { pageArgs } from '../utils/pagination';
import { onMenuWhere } from '../utils/menu';
import { computeSellerAvailability } from './availability.service';

/** The query a visitor's browsing of kitchens may carry: whatever the address bar had, so each value is checked before use. */
export interface PublicSellerFilters {
  communityId?: unknown;
  city?: unknown;
  businessType?: unknown;
  search?: unknown;
  limit?: unknown;
  sort?: unknown;
}

/**
 * The verified, active kitchens a visitor may browse, best rated first (or, with `sort=trending`, those people are ordering
 * from now), each with up to four dishes on its menu.
 */
export async function listPublicSellers(filters: PublicSellerFilters) {
  const { communityId, city, businessType, search, limit, sort } = filters;

  const whereClause: any = {
    isVerified: true,
    status: 'active',
    verificationStatus: 'approved',
  };

  if (communityId && typeof communityId === 'string') {
    whereClause.communityId = communityId;
  }

  if (city && typeof city === 'string') {
    whereClause.community = {
      city: {
        equals: city,
        mode: 'insensitive',
      },
    };
  }

  if (businessType && typeof businessType === 'string') {
    whereClause.businessType = businessType;
  }

  const term = searchTerm(search);
  if (term) {
    whereClause.OR = [
      { businessName: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  // trending: kitchens people are ordering from now (see utils/ranking.ts), only those with
  // real recent demand. Otherwise best rated first, by the review-count-aware score.
  if (sort === 'trending') whereClause.trendScore = { gt: 0 };
  const orderBy: Prisma.SellerOrderByWithRelationInput[] =
    sort === 'trending'
      ? [{ trendScore: 'desc' }, { ratingScore: 'desc' }, { id: 'asc' }]
      : [{ ratingScore: 'desc' }, { trendScore: 'desc' }, { id: 'asc' }];

  const sellers = await prisma.seller.findMany({
    where: whereClause,
    take: pageArgs(1, limit, 30, 50).limit,
    orderBy,
    include: {
      user: {
        select: {
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              area: true,
            },
          },
        },
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          deliveryBaseFee: true,
        },
      },
      products: {
        where: { isActive: true, approvalStatus: 'approved', ...onMenuWhere() },
        take: 4,
        select: {
          id: true,
          name: true,
          price: true,
          originalPrice: true,
          productType: true,
          preparationTime: true,
          images: {
            select: {
              imageUrl: true,
              isPrimary: true,
            },
          },
        },
      },
      _count: {
        select: {
          products: { where: { isActive: true, approvalStatus: 'approved', ...onMenuWhere() } },
          reviews: { where: { isApproved: true } },
        },
      },
    },
  });

  const formatted = sellers.map((s) => ({
    id: s.id,
    businessName: s.businessName,
    businessNameUrdu: s.businessNameUrdu,
    description: s.description,
    coverImageUrl: s.coverImageUrl,
    // Real rating only: 0 with no reviews (the UI shows "New"), never a made-up 4.8.
    ratingAverage: Number(s.ratingAverage) || 0,
    totalReviews: s.totalReviews || s._count.reviews || 0,
    trendScore: Math.round(s.trendScore * 100) / 100,
    // null when the kitchen hasn't set one: the UI shows nothing rather than a guess.
    minPrepTimeMinutes: s.minPrepTimeMinutes ?? null,
    minOrderAmountForDelivery: s.minOrderAmountForDelivery != null ? Number(s.minOrderAmountForDelivery) : null,
    freeDeliveryThreshold: s.freeDeliveryThreshold != null ? Number(s.freeDeliveryThreshold) : null,
    deliveryFeeType: s.deliveryFeeType || null,
    deliveryFeeFixed: s.deliveryFeeFixed != null ? Number(s.deliveryFeeFixed) : null,
    freeDeliveryRadiusKm: s.freeDeliveryRadiusKm != null ? Number(s.freeDeliveryRadiusKm) : null,
    businessType: s.businessType,
    mealCategories: s.mealCategories,
    allowCrossCommunity: s.allowCrossCommunity,
    community: s.community,
    availability: computeSellerAvailability({
      status: s.status,
      scheduleMode: s.scheduleMode,
      operatingHours: s.operatingHours,
      availabilityOverride: s.availabilityOverride,
      availabilityOverrideUntil: s.availabilityOverrideUntil,
      availabilityNote: s.availabilityNote,
    }),
    chef: {
      name: s.user?.profile?.fullName || s.businessName,
      avatar: s.user?.profile?.avatarUrl || null,
      area: s.user?.profile?.area || s.community?.name || '',
      city: s.user?.profile?.city || s.community?.city || '',
    },
    products: s.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      productType: p.productType,
      images: p.images.map((img) => img.imageUrl),
      preparationTime: p.preparationTime,
    })),
    productCount: s._count.products,
  }));

  return formatted;
}

/**
 * One verified kitchen's public storefront: its settings, availability, menu and latest reviews. 404 SELLER_NOT_FOUND when there is
 * no such kitchen or it is not verified and active.
 */
export async function getPublicSeller(id: string) {
  // Search by seller.id, or by the owner's user id so older bookmarks keep working. The user id is
  // accepted as input but never returned: the response carries the seller id only.
  const seller = await prisma.seller.findFirst({
    where: {
      OR: [
        { id },
        { userId: id },
      ],
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
    },
    include: {
      user: {
        select: {
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              area: true,
            },
          },
        },
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          deliveryBaseFee: true,
          crossCommunityBaseFee: true,
          areaDescription: true,
        },
      },
      products: {
        where: { isActive: true, approvalStatus: 'approved', ...onMenuWhere() },
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          images: {
            select: {
              imageUrl: true,
              isPrimary: true,
            },
          },
        },
      },
      reviews: {
        where: { isApproved: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              profile: {
                select: {
                  fullName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!seller) {
    throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
  }

  const availability = computeSellerAvailability({
    status: seller.status,
    scheduleMode: seller.scheduleMode,
    operatingHours: seller.operatingHours,
    availabilityOverride: seller.availabilityOverride,
    availabilityOverrideUntil: seller.availabilityOverrideUntil,
    availabilityNote: seller.availabilityNote,
  });

  const result = {
    id: seller.id,
    businessName: seller.businessName,
    businessNameUrdu: seller.businessNameUrdu,
    description: seller.description,
    coverImageUrl: seller.coverImageUrl,
    ratingAverage: Number(seller.ratingAverage) || 0,
    totalReviews: seller.totalReviews || seller.reviews.length || 0,
    minPrepTimeMinutes: seller.minPrepTimeMinutes ?? null,
    minOrderAmountForDelivery: seller.minOrderAmountForDelivery != null ? Number(seller.minOrderAmountForDelivery) : null,
    freeDeliveryThreshold: seller.freeDeliveryThreshold != null ? Number(seller.freeDeliveryThreshold) : null,
    deliveryFeeType: seller.deliveryFeeType || null,
    deliveryFeeFixed: seller.deliveryFeeFixed != null ? Number(seller.deliveryFeeFixed) : null,
    deliveryFeeBase: seller.deliveryFeeBase != null ? Number(seller.deliveryFeeBase) : null,
    deliveryFeePerKm: seller.deliveryFeePerKm != null ? Number(seller.deliveryFeePerKm) : null,
    freeDeliveryRadiusKm: seller.freeDeliveryRadiusKm != null ? Number(seller.freeDeliveryRadiusKm) : null,
    freeDeliveryAreas: seller.freeDeliveryAreas || [],
    scheduleMode: seller.scheduleMode,
    operatingHours: seller.operatingHours,
    orderCutoffTime: seller.orderCutoffTime,
    preOrderOnly: seller.preOrderOnly,
    storeNotice: seller.storeNotice,
    businessType: seller.businessType,
    mealCategories: seller.mealCategories,
    allowCrossCommunity: seller.allowCrossCommunity,
    isVerified: seller.isVerified,
    verificationStatus: seller.verificationStatus,
    availability,
    community: seller.community,
    chef: {
      name: seller.user?.profile?.fullName || seller.businessName,
      avatar: seller.user?.profile?.avatarUrl || null,
      bio: seller.description,
      area: seller.user?.profile?.area || seller.community?.name || '',
      city: seller.user?.profile?.city || seller.community?.city || '',
    },
    products: seller.products.map((p) => ({
      id: p.id,
      name: p.name,
      nameUrdu: p.nameUrdu,
      description: p.description,
      price: Number(p.price),
      originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
      productType: p.productType,
      images: p.images.map((img) => img.imageUrl),
      preparationTime: p.preparationTime,
      storageDays: p.storageDays,
      heatingInstructions: p.heatingInstructions,
      ingredients: p.ingredients,
      allergens: p.allergens,
      dietaryInfo: p.dietaryInfo,
      stockQuantity: p.stockQuantity,
      category: p.category,
    })),
    reviews: seller.reviews.map((r) => ({
      id: r.id,
      rating: r.sellerRating ?? r.productRating ?? null,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.customer?.profile?.fullName || 'Verified Buyer',
      avatar: r.customer?.profile?.avatarUrl || null,
    })),
  };

  return result;
}
