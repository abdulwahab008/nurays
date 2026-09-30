import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { haversineKm } from '../utils/deliveryFee';

export class CommunityService {
  /**
   * Get all active communities with seller counts
   */
  async getAllCommunities() {
    const communities = await prisma.community.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            sellers: {
              where: { isVerified: true, status: 'active' },
            },
          },
        },
      },
    });

    return communities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      city: c.city,
      areaDescription: c.areaDescription,
      centerLatitude: Number(c.centerLatitude),
      centerLongitude: Number(c.centerLongitude),
      radiusKm: c.radiusKm,
      neighborCommunityIds: c.neighborCommunityIds,
      crossCommunityEnabled: c.crossCommunityEnabled,
      deliveryBaseFee: Number(c.deliveryBaseFee),
      crossCommunityBaseFee: Number(c.crossCommunityBaseFee),
      sellerCount: c._count.sellers,
    }));
  }

  /**
   * Get community by slug or id, with full details and resolved neighbor community objects
   */
  async getCommunity(identifier: string) {
    const community = await prisma.community.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        sellers: {
          where: { isVerified: true, status: 'active' },
          select: {
            id: true,
            businessName: true,
            businessType: true,
            description: true,
            ratingAverage: true,
            totalReviews: true,
            coverImageUrl: true,
            allowCrossCommunity: true,
            minPrepTimeMinutes: true,
            primaryCommunityName: true,
            mealCategories: true,
            user: {
              select: {
                profile: {
                  select: {
                    fullName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            products: {
              where: { isActive: true, approvalStatus: 'approved' },
              select: {
                id: true,
                name: true,
                price: true,
                productType: true,
              },
              take: 3,
            },
          },
        },
      },
    });

    if (!community) {
      throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
    }

    // Resolve neighbor communities
    const neighbors = community.neighborCommunityIds.length > 0
      ? await prisma.community.findMany({
          where: { id: { in: community.neighborCommunityIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            deliveryBaseFee: true,
            crossCommunityBaseFee: true,
          },
        })
      : [];

    return {
      id: community.id,
      name: community.name,
      slug: community.slug,
      city: community.city,
      areaDescription: community.areaDescription,
      centerLatitude: Number(community.centerLatitude),
      centerLongitude: Number(community.centerLongitude),
      radiusKm: community.radiusKm,
      crossCommunityEnabled: community.crossCommunityEnabled,
      deliveryBaseFee: Number(community.deliveryBaseFee),
      crossCommunityBaseFee: Number(community.crossCommunityBaseFee),
      neighbors: neighbors.map((n) => ({
        id: n.id,
        name: n.name,
        slug: n.slug,
        deliveryBaseFee: Number(n.deliveryBaseFee),
        crossCommunityBaseFee: Number(n.crossCommunityBaseFee),
      })),
      sellers: community.sellers.map((s) => ({
        id: s.id,
        businessName: s.businessName,
        businessType: s.businessType,
        description: s.description,
        ratingAverage: Number(s.ratingAverage),
        totalReviews: s.totalReviews || 0,
        coverImageUrl: s.coverImageUrl,
        allowCrossCommunity: s.allowCrossCommunity,
        minPrepTimeMinutes: s.minPrepTimeMinutes || 20,
        chefName: s.user?.profile?.fullName || s.businessName,
        avatar: s.user?.profile?.avatarUrl,
        cuisines: s.mealCategories || [],
        products: s.products.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          productType: p.productType,
        })),
      })),
    };
  }

  /**
   * Detect closest community based on buyer's GPS latitude and longitude
   */
  async detectCommunity(lat: number, lng: number) {
    const communities = await prisma.community.findMany({
      where: { isActive: true },
    });

    if (communities.length === 0) {
      throw new AppError('No active communities found', 404, 'COMMUNITIES_EMPTY');
    }

    let closest: (typeof communities)[0] = communities[0];
    let minDistance = Infinity;

    for (const c of communities) {
      const distance = haversineKm(
        lat,
        lng,
        Number(c.centerLatitude),
        Number(c.centerLongitude)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closest = c;
      }
    }

    const isInsideRadius = minDistance <= closest.radiusKm;

    return {
      community: {
        id: closest.id,
        name: closest.name,
        slug: closest.slug,
        city: closest.city,
        centerLatitude: Number(closest.centerLatitude),
        centerLongitude: Number(closest.centerLongitude),
        deliveryBaseFee: Number(closest.deliveryBaseFee),
      },
      distanceKm: Math.round(minDistance * 10) / 10,
      isInsideRadius,
    };
  }

  /**
   * Set primary community for a buyer
   */
  async setBuyerCommunity(userId: string, communityId: string) {
    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { primaryCommunityId: community.id },
    });

    // Also update UserProfile area if not set
    await prisma.userProfile.updateMany({
      where: { userId },
      data: { area: community.name, city: community.city },
    });

    return {
      success: true,
      primaryCommunity: {
        id: community.id,
        name: community.name,
        slug: community.slug,
        city: community.city,
      },
    };
  }
}

export const communityService = new CommunityService();
