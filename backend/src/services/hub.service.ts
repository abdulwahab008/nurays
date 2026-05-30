import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class HubService {
  /**
   * Get hub centers
   */
  async getHubCenters(filters: { city?: string }) {
    const where: any = {
      status: 'active',
    };

    if (filters.city) {
      where.city = filters.city;
    }

    const hubs = await prisma.hubCenter.findMany({
      where,
      include: {
        inventory: {
          where: { quantity: { gt: 0 } },
          select: { productId: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      code: hub.code,
      city: hub.city,
      area: hub.area,
      address: hub.address,
      coordinates: hub.latitude && hub.longitude
        ? {
            latitude: Number(hub.latitude),
            longitude: Number(hub.longitude),
          }
        : null,
      operatingHours: hub.operatingHours as any,
      status: hub.status,
      availableProductsCount: hub.inventory.length,
    }));
  }

  /**
   * Get hub inventory
   */
  async getHubInventory(
    hubId: string,
    filters: {
      categoryId?: string;
      search?: string;
    }
  ) {
    const hub = await prisma.hubCenter.findUnique({
      where: { id: hubId },
    });

    if (!hub) {
      throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
    }

    const where: any = {
      hubId,
      quantity: { gt: 0 },
    };

    if (filters.categoryId) {
      where.product = {
        categoryId: filters.categoryId,
      };
    }

    if (filters.search) {
      where.product = {
        ...where.product,
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { nameUrdu: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const inventory = await prisma.hubInventory.findMany({
      where,
      include: {
        product: {
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                isVerified: true,
              },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      hub: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        city: hub.city,
        area: hub.area,
        address: hub.address,
      },
      inventory: inventory.map((item) => ({
        product: {
          id: item.product.id,
          name: item.product.name,
          nameUrdu: item.product.nameUrdu,
          price: Number(item.product.price),
          image: item.product.images[0]?.imageUrl || null,
          seller: {
            id: item.product.seller.id,
            businessName: item.product.seller.businessName,
            isVerified: item.product.seller.isVerified,
          },
        },
        quantity: item.quantity,
        expiryDate: item.expiryDate,
        batchNumber: item.batchNumber,
      })),
    };
  }
}

export default new HubService();

