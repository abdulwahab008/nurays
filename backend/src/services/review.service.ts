import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { refreshRatingScores } from './ranking.service';
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

    // Create review. The (orderItem, customer) pair is unique in the database, so a
    // double-submit that slips past the check above fails cleanly instead of duplicating.
    let review;
    try {
      review = await prisma.review.create({
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
    })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError('Review already exists', 400, 'REVIEW_ALREADY_EXISTS');
      }
      throw err;
    }

    // Update product rating
    if (orderItem.productId) {
      await this.updateProductRating(orderItem.productId);
    }

    // Update seller rating
    await this.updateSellerRating(orderItem.seller.id);

    // And the rating of the Nuray rider who brought it, if one did.
    if (data.deliveryRating != null) {
      const delivery = await prisma.delivery.findUnique({ where: { orderId: data.orderId }, select: { riderId: true, status: true } });
      if (delivery?.riderId && delivery.status === 'delivered') await this.updateRiderRating(delivery.riderId);
    }

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
    const { page, limit, skip } = pageArgs(filters.page, filters.limit, 10, 50);

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
   * Work out again everything one review feeds into (the dish's, the kitchen's and the Nuray rider's ratings): after
   * staff hide a review, or show one again, it counts or stops counting.
   */
  async refreshRatingsFor(review: { productId: string | null; sellerId: string; orderId: string; deliveryRating: number | null }) {
    if (review.productId) await this.updateProductRating(review.productId);
    await this.updateSellerRating(review.sellerId);
    if (review.deliveryRating != null) {
      const delivery = await prisma.delivery.findUnique({ where: { orderId: review.orderId }, select: { riderId: true, status: true } });
      if (delivery?.riderId && delivery.status === 'delivered') await this.updateRiderRating(delivery.riderId);
    }
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
    await refreshRatingScores({ productId });
  }

  /**
   * Update seller rating. Reviews are per order item, but a customer rates the kitchen once
   * per order, so each order counts once: an order with five dishes must not weigh five times
   * as much as an order with one. totalReviews is the number of reviewed orders.
   */
  private async updateSellerRating(sellerId: string) {
    const [row] = await prisma.$queryRaw<Array<{ avg: number | null; orders: number }>>`
      SELECT AVG(order_rating)::float AS avg, COUNT(*)::int AS orders
      FROM (
        SELECT AVG(seller_rating) AS order_rating
        FROM reviews
        WHERE seller_id = ${sellerId} AND is_approved = true AND seller_rating IS NOT NULL
        GROUP BY order_id
      ) per_order`;

    await prisma.seller.update({
      where: { id: sellerId },
      data: {
        ratingAverage: Math.round((row?.avg ?? 0) * 100) / 100,
        totalReviews: row?.orders ?? 0,
      },
    });
    await refreshRatingScores({ sellerId });
  }

  /** A rider's rating: the average delivery rating of the orders they delivered, each order once. */
  private async updateRiderRating(riderId: string) {
    const [row] = await prisma.$queryRaw<Array<{ avg: number | null }>>`
      SELECT AVG(order_rating)::float AS avg
      FROM (
        SELECT AVG(r.delivery_rating) AS order_rating
        FROM reviews r
        JOIN deliveries d ON d."orderId" = r.order_id
        WHERE d.rider_id = ${riderId} AND d.status = 'delivered' AND r.is_approved = true AND r.delivery_rating IS NOT NULL
        GROUP BY r.order_id
      ) per_order`;

    await prisma.rider.update({
      where: { id: riderId },
      data: { ratingAverage: Math.round((row?.avg ?? 0) * 100) / 100 },
    });
  }
}

export default new ReviewService();

