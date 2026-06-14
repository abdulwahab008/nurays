import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class FavoriteService {
  /** List the user's favourite products, shaped like product-list items. */
  async list(userId: string) {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            seller: { select: { businessName: true, isVerified: true } },
          },
        },
      },
    });

    return favorites
      .filter((f) => f.product != null)
      .map((f) => ({
        id: f.product.id,
        name: f.product.name,
        slug: f.product.slug,
        price: Number(f.product.price),
        unit: f.product.unit,
        ratingAverage: Number(f.product.ratingAverage),
        totalReviews: f.product.totalReviews,
        primaryImage: f.product.images[0]?.imageUrl ?? null,
        isActive: f.product.isActive,
        seller: f.product.seller
          ? { businessName: f.product.seller.businessName, isVerified: f.product.seller.isVerified }
          : null,
      }));
  }

  /** Product ids the user has favourited (for hydrating heart toggles). */
  async ids(userId: string): Promise<string[]> {
    const favs = await prisma.favorite.findMany({ where: { userId }, select: { productId: true } });
    return favs.map((f) => f.productId);
  }

  async add(userId: string, productId: string) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }
    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    return { productId, favorited: true };
  }

  async remove(userId: string, productId: string) {
    await prisma.favorite.deleteMany({ where: { userId, productId } });
    return { productId, favorited: false };
  }
}

export default new FavoriteService();
