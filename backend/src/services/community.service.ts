import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { haversineKm } from '../utils/deliveryFee';
import { onMenuWhere } from '../utils/menu';

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
              where: { isActive: true, approvalStatus: 'approved', ...onMenuWhere() },
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

  distanceToCommunityKm(c: { centerLatitude: unknown; centerLongitude: unknown }, lat: number, lng: number): number {
    return haversineKm(lat, lng, Number(c.centerLatitude), Number(c.centerLongitude));
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
   * Work out which community a delivery address belongs to, so community delivery
   * rules can apply to it. Tried in order:
   *   1. GPS point inside a community's radius (nearest wins)
   *   2. the address area naming a community ("Askari 11")
   *   3. the buyer's own community, if it is in the same city as the address
   * Returns null when nothing matches (the seller-wide delivery policy then applies).
   */
  async resolveCommunityIdForAddress(
    address: { area?: string | null; city?: string | null; latitude?: unknown; longitude?: unknown },
    userId?: string
  ): Promise<string | null> {
    const communities = await prisma.community.findMany({ where: { isActive: true } });
    if (communities.length === 0) return null;

    const lat = address.latitude != null ? Number(address.latitude) : null;
    const lng = address.longitude != null ? Number(address.longitude) : null;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      let best: { id: string; distance: number } | null = null;
      for (const c of communities) {
        const distance = haversineKm(lat, lng, Number(c.centerLatitude), Number(c.centerLongitude));
        if (distance <= c.radiusKm && (!best || distance < best.distance)) {
          best = { id: c.id, distance };
        }
      }
      if (best) return best.id;
    }

    const norm = (v?: string | null) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const area = norm(address.area);
    if (area) {
      const byName = communities.find((c) => {
        const n = norm(c.name);
        const sl = norm(c.slug);
        return (n && n === area) || (sl && sl === area);
      });
      if (byName) return byName.id;
      // Whole-word containment ("askari 11 phase 2" names Askari 11, "askari 111" doesn't);
      // an empty normalised name matches everything under includes(), so it is skipped.
      const padded = ` ${area} `;
      const contained = communities.find((c) => {
        const n = norm(c.name);
        return n.length > 0 && padded.includes(` ${n} `);
      });
      if (contained) return contained.id;
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { primaryCommunityId: true },
      });
      const home = communities.find((c) => c.id === user?.primaryCommunityId);
      if (home && norm(home.city) === norm(address.city)) return home.id;
    }

    return null;
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
