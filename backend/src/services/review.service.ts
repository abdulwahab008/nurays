import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class ReviewService {
  /**
   * Add review
   */
  async addReview(
    userId: string,
    data: {
      orderId: string;
      orderItemId: string;
      productRating: number;
      sellerRating: number;
      deliveryRating?: number;
      comment?: string;
      photos?: string[];
    }
  ) {
    // Verify order belongs to user
    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      include: {
        items: {
          where: { id: data.orderItemId },
          include: {
            seller: {
              select: { id: true },
            },
            product: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.customerId !== userId) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    if (order.orderStatus !== 'delivered' && order.orderStatus !== 'completed') {
      throw new AppError('Order must be delivered before reviewing', 400, 'ORDER_NOT_DELIVERED');
    }

    const orderItem = order.items[0];
    if (!orderItem) {
      throw new AppError('Order item not found', 404, 'ORDER_ITEM_NOT_FOUND');
    }

    // Check if review already exists
    const existingReview = await prisma.review.findFirst({
      where: {
        orderId: data.orderId,
        orderItemId: data.orderItemId,
        customerId: userId,
      },
    });

    if (existingReview) {
      throw new AppError('Review already exists', 400, 'REVIEW_ALREADY_EXISTS');
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        orderId: data.orderId,
        orderItemId: data.orderItemId,
        customerId: userId,
        sellerId: orderItem.seller.id,
        productId: orderItem.product?.id || null,
        productRating: data.productRating,
        sellerRating: data.sellerRating,
        deliveryRating: data.deliveryRating,
        comment: data.comment,
        photos: data.photos || [],
        isVerifiedPurchase: true,
        isApproved: true, // Auto-approve for now
      },
    });

    // Update product rating
    if (orderItem.productId) {
      await this.updateProductRating(orderItem.productId);
    }

    // Update seller rating
    await this.updateSellerRating(orderItem.seller.id);

    return review;
  }

  /**
   * Get product reviews
   */
  async getProductReviews(
    productId: string,
    filters: {
      page?: number;
      limit?: number;
      rating?: number;
    }
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const skip = (page - 1) * limit;

    const where: any = {
      productId,
      isApproved: true,
    };

    if (filters.rating) {
      where.productRating = filters.rating;
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          customer: {
            include: {
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          seller: {
            select: {
              businessName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({ where }),
    ]);

    // Get rating breakdown
    const ratingBreakdown = await prisma.review.groupBy({
      by: ['productRating'],
      where: { productId, isApproved: true },
      _count: true,
    });

    const breakdown: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    ratingBreakdown.forEach((item) => {
      if (item.productRating !== null) {
        breakdown[item.productRating.toString()] = item._count;
      }
    });

    // Calculate average rating
    const avgRating = await prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { productRating: true },
    });

    return {
      reviews: reviews.map((review) => ({
        id: review.id,
        customerName: review.customer.profile?.fullName || 'Anonymous',
        productRating: review.productRating,
        sellerRating: review.sellerRating,
        deliveryRating: review.deliveryRating,
        comment: review.comment,
        photos: review.photos,
        isVerifiedPurchase: review.isVerifiedPurchase,
        sellerResponse: review.sellerResponse,
        createdAt: review.createdAt,
      })),
      summary: {
        averageRating: avgRating._avg.productRating || 0,
        totalReviews: total,
        ratingBreakdown: breakdown,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update product rating
   */
  private async updateProductRating(productId: string) {
    const avgRating = await prisma.review.aggregate({
      where: {
        productId,
        isApproved: true,
      },
      _avg: { productRating: true },
      _count: true,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        ratingAverage: avgRating._avg.productRating || 0,
        totalReviews: avgRating._count,
      },
    });
  }

  /**
   * Update seller rating
   */
  private async updateSellerRating(sellerId: string) {
    const avgRating = await prisma.review.aggregate({
      where: {
        sellerId,
        isApproved: true,
      },
      _avg: { sellerRating: true },
      _count: true,
    });

    await prisma.seller.update({
      where: { id: sellerId },
      data: {
        ratingAverage: avgRating._avg.sellerRating || 0,
        totalReviews: avgRating._count,
      },
    });
  }
}

export default new ReviewService();

