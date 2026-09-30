import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { computeSellerAvailability } from './availability.service';
import { haversineKm } from '../utils/deliveryFee';

export class FavoriteService {
  /**
   * List favorite sellers for a user
   */
  async getFavorites(userId: string, customerLat?: number, customerLng?: number) {
    const favorites = await prisma.favoriteSeller.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          include: {
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
                deliveryBaseFee: true,
              },
            },
            products: {
              where: { isActive: true },
              take: 3,
              select: {
                id: true,
                name: true,
                price: true,
                images: {
                  take: 1,
                  orderBy: { sortOrder: 'asc' },
                  select: { imageUrl: true },
                },
              },
            },
          },
        },
      },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

    return favorites.map((fav) => {
      const s = fav.seller;
      const availability = computeSellerAvailability(s as any);

      let distanceKm: number | null = null;
      if (
        customerLat != null &&
        customerLng != null &&
        s.latitude != null &&
        s.longitude != null
      ) {
        distanceKm =
          Math.round(
            haversineKm(customerLat, customerLng, Number(s.latitude), Number(s.longitude)) * 10
          ) / 10;
      }

      return {
        id: fav.id,
        sellerId: s.id,
        businessName: s.businessName,
        businessType: s.businessType,
        ratingAverage: Number(s.ratingAverage),
        totalReviews: s.totalReviews,
        coverImageUrl: s.coverImageUrl,
        community: s.community
          ? {
              id: s.community.id,
              name: s.community.name,
              slug: s.community.slug,
            }
          : s.primaryCommunityName
          ? { id: '', name: s.primaryCommunityName, slug: '' }
          : null,
        distanceKm,
        availability: {
          isOpen: availability.isOpen,
          status: availability.status,
          nextOpenAt: availability.nextOpenAt,
          reason: availability.reason,
        },
        sampleProducts: s.products.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          image: p.images[0]?.imageUrl
            ? p.images[0].imageUrl.startsWith('http')
              ? p.images[0].imageUrl
              : `${baseUrl}${p.images[0].imageUrl}`
            : null,
        })),
        savedAt: fav.createdAt,
      };
    });
  }

  /**
   * Add a seller to user's favorites
   */
  async addFavorite(userId: string, sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const existing = await prisma.favoriteSeller.findUnique({
      where: {
        userId_sellerId: { userId, sellerId },
      },
    });

    if (existing) {
      return { success: true, message: 'Already in favorites', isFavorite: true };
    }

    await prisma.favoriteSeller.create({
      data: { userId, sellerId },
    });

    return { success: true, message: 'Added to favorites', isFavorite: true };
  }

  /**
   * Remove a seller from user's favorites
   */
  async removeFavorite(userId: string, sellerId: string) {
    await prisma.favoriteSeller.deleteMany({
      where: { userId, sellerId },
    });

    return { success: true, message: 'Removed from favorites', isFavorite: false };
  }

  /**
   * Check if a seller is in user's favorites
   */
  async checkFavorite(userId: string, sellerId: string) {
    const existing = await prisma.favoriteSeller.findUnique({
      where: {
        userId_sellerId: { userId, sellerId },
      },
    });

    return { isFavorite: !!existing };
  }
}

export const favoriteService = new FavoriteService();
