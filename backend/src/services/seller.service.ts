import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import adminService from './admin.service';

export class SellerService {
  /**
   * Register as seller
   */
  async registerAsSeller(
    userId: string,
    data: {
      businessName: string;
      businessNameUrdu?: string;
      description?: string;
      kitchenVideoUrl?: string;
      coverImageUrl?: string;
      cnicFrontUrl?: string;
      cnicBackUrl?: string;
      kitchenPhotoUrls?: string[];
    }
  ) {
    // Check if user already has a seller account
    const existingSeller = await prisma.seller.findUnique({
      where: { userId },
    });

    if (existingSeller) {
      throw new AppError('Seller account already exists', 400, 'SELLER_ALREADY_EXISTS');
    }

    // Check if user is already a seller type
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Create seller account — commissionRate comes from the platform setting
    // at signup time; each seller's own rate can still be adjusted later.
    const commissionRate = await adminService.getSettingValue<number>('commissionRate');
    const seller = await prisma.seller.create({
      data: {
        userId,
        businessName: data.businessName,
        businessNameUrdu: data.businessNameUrdu,
        description: data.description,
        kitchenVideoUrl: data.kitchenVideoUrl,
        coverImageUrl: data.coverImageUrl,
        commissionRate,
        // CNIC and kitchen photos should be stored via SellerDocument model
        // For now, we'll skip these fields
        // status tracks active/inactive/suspended account standing (defaults
        // to 'active') — approval state lives in verificationStatus alone.
        verificationStatus: 'pending',
      },
    });

    // Update user type to seller (if not already)
    if (user.userType !== 'seller') {
      await prisma.user.update({
        where: { id: userId },
        data: { userType: 'seller' },
      });
    }

    return {
      sellerId: seller.id,
      verificationStatus: seller.verificationStatus,
      message: 'Application submitted for review',
    };
  }

  /**
   * Get current seller profile (for settings / me)
   */
  async getSellerProfile(userId: string) {
    const seller = await prisma.seller.findUnique({
      where: { userId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    return {
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      jazzcashNumber: seller.jazzcashNumber,
      easypaisaNumber: seller.easypaisaNumber,
      bankAccountName: seller.bankAccountName,
      bankAccountNumber: seller.bankAccountNumber,
      bankName: seller.bankName,
      lowStockThreshold: seller.lowStockThreshold,
      enableStockAlerts: seller.enableStockAlerts,
      freeDeliveryAreas: (seller.freeDeliveryAreas as string[] | null) ?? [],
      freeDeliveryRadiusKm: seller.freeDeliveryRadiusKm != null ? Number(seller.freeDeliveryRadiusKm) : null,
      latitude: seller.latitude != null ? Number(seller.latitude) : null,
      longitude: seller.longitude != null ? Number(seller.longitude) : null,
      deliveryFeeType: seller.deliveryFeeType,
      deliveryFeeFixed: seller.deliveryFeeFixed,
      deliveryFeeBase: seller.deliveryFeeBase,
      deliveryFeePerKm: seller.deliveryFeePerKm != null ? Number(seller.deliveryFeePerKm) : null,
      verificationStatus: seller.verificationStatus,
      status: seller.status,
      isVerified: seller.isVerified,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    };
  }

  /**
   * Update current seller profile
   */
  async updateSellerProfile(
    userId: string,
    data: {
      businessName?: string;
      businessNameUrdu?: string;
      description?: string;
      kitchenVideoUrl?: string;
      coverImageUrl?: string;
      jazzcashNumber?: string;
      easypaisaNumber?: string;
      bankAccountName?: string;
      bankAccountNumber?: string;
      bankName?: string;
      lowStockThreshold?: number;
      enableStockAlerts?: boolean;
      freeDeliveryAreas?: string[];
      freeDeliveryRadiusKm?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      deliveryFeeType?: string | null;
      deliveryFeeFixed?: number | null;
      deliveryFeeBase?: number | null;
      deliveryFeePerKm?: number | null;
    }
  ) {
    const seller = await prisma.seller.findUnique({
      where: { userId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const updateData: Record<string, unknown> = {};
    if (data.businessName !== undefined) updateData.businessName = data.businessName;
    if (data.businessNameUrdu !== undefined) updateData.businessNameUrdu = data.businessNameUrdu;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.kitchenVideoUrl !== undefined) updateData.kitchenVideoUrl = data.kitchenVideoUrl || null;
    if (data.coverImageUrl !== undefined) updateData.coverImageUrl = data.coverImageUrl || null;
    if (data.jazzcashNumber !== undefined) updateData.jazzcashNumber = data.jazzcashNumber || null;
    if (data.easypaisaNumber !== undefined) updateData.easypaisaNumber = data.easypaisaNumber || null;
    if (data.bankAccountName !== undefined) updateData.bankAccountName = data.bankAccountName || null;
    if (data.bankAccountNumber !== undefined) updateData.bankAccountNumber = data.bankAccountNumber || null;
    if (data.bankName !== undefined) updateData.bankName = data.bankName || null;
    if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold;
    if (data.enableStockAlerts !== undefined) updateData.enableStockAlerts = data.enableStockAlerts;
    if (data.freeDeliveryAreas !== undefined) updateData.freeDeliveryAreas = data.freeDeliveryAreas;
    if (data.freeDeliveryRadiusKm !== undefined) updateData.freeDeliveryRadiusKm = data.freeDeliveryRadiusKm;
    if (data.latitude !== undefined) updateData.latitude = data.latitude;
    if (data.longitude !== undefined) updateData.longitude = data.longitude;
    if (data.deliveryFeeType !== undefined) updateData.deliveryFeeType = data.deliveryFeeType;
    if (data.deliveryFeeFixed !== undefined) updateData.deliveryFeeFixed = data.deliveryFeeFixed;
    if (data.deliveryFeeBase !== undefined) updateData.deliveryFeeBase = data.deliveryFeeBase;
    if (data.deliveryFeePerKm !== undefined) updateData.deliveryFeePerKm = data.deliveryFeePerKm;

    const updated = await prisma.seller.update({
      where: { id: seller.id },
      data: updateData,
    });

    return {
      id: updated.id,
      businessName: updated.businessName,
      businessNameUrdu: updated.businessNameUrdu,
      description: updated.description,
      kitchenVideoUrl: updated.kitchenVideoUrl,
      coverImageUrl: updated.coverImageUrl,
      jazzcashNumber: updated.jazzcashNumber,
      easypaisaNumber: updated.easypaisaNumber,
      bankAccountName: updated.bankAccountName,
      bankAccountNumber: updated.bankAccountNumber,
      bankName: updated.bankName,
      lowStockThreshold: updated.lowStockThreshold,
      enableStockAlerts: updated.enableStockAlerts,
      freeDeliveryAreas: (updated.freeDeliveryAreas as string[] | null) ?? [],
      freeDeliveryRadiusKm: updated.freeDeliveryRadiusKm != null ? Number(updated.freeDeliveryRadiusKm) : null,
      latitude: updated.latitude != null ? Number(updated.latitude) : null,
      longitude: updated.longitude != null ? Number(updated.longitude) : null,
      deliveryFeeType: updated.deliveryFeeType,
      deliveryFeeFixed: updated.deliveryFeeFixed,
      deliveryFeeBase: updated.deliveryFeeBase,
      deliveryFeePerKm: updated.deliveryFeePerKm != null ? Number(updated.deliveryFeePerKm) : null,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Get seller dashboard
   */
  async getSellerDashboard(sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      include: {
        products: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order statistics
    const orderItems = await prisma.orderItem.findMany({
      where: { sellerId },
      include: {
        order: {
          select: {
            orderStatus: true,
            paymentStatus: true,
          },
        },
      },
    });

    const activeOrders = orderItems.filter(
      (item) =>
        item.order.orderStatus !== 'delivered' &&
        item.order.orderStatus !== 'completed' &&
        item.order.orderStatus !== 'cancelled'
    ).length;

    const pendingOrders = orderItems.filter(
      (item) => item.order.orderStatus === 'pending' || item.order.orderStatus === 'preparing'
    ).length;

    // Calculate earnings
    const completedItems = orderItems.filter(
      (item) => item.order.orderStatus === 'delivered' || item.order.orderStatus === 'completed'
    );

    const totalEarnings = completedItems.reduce((sum, item) => {
      return sum + Number(item.sellerPayout);
    }, 0);

    // Get pending payout
    const pendingPayouts = await prisma.sellerPayout.findMany({
      where: {
        sellerId,
        status: { in: ['pending', 'processing'] },
      },
      select: {
        netAmount: true,
      },
    });

    const pendingPayout = pendingPayouts.reduce((sum, payout) => {
      return sum + Number(payout.netAmount);
    }, 0);

    // Get recent orders
    const recentOrderItems = await prisma.orderItem.findMany({
      where: { sellerId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            orderStatus: true,
            createdAt: true,
          },
        },
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Get low stock products
    const lowStockProducts = await prisma.product.findMany({
      where: {
        sellerId,
        isActive: true,
        stockQuantity: { lte: 10 },
      },
      include: {
        images: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: { stockQuantity: 'asc' },
      take: 5,
    });

    // Get pending reviews
    const pendingReviews = await prisma.review.findMany({
      where: {
        sellerId,
        isApproved: false,
      },
      include: {
        product: {
          select: {
            name: true,
          },
        },
        customer: {
          include: {
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      // Seller profile information
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      verificationStatus: seller.verificationStatus,
      status: seller.status,
      isVerified: seller.isVerified,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      // Dashboard analytics
      overview: {
        totalProducts: seller.products.length,
        activeOrders,
        pendingOrders,
        totalEarnings,
        pendingPayout,
        rating: Number(seller.ratingAverage),
        totalReviews: seller.totalReviews,
      },
      recentOrders: recentOrderItems.map((item) => ({
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        productName: item.product?.name || item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        totalPrice: Number(item.totalPrice),
        orderStatus: item.order.orderStatus,
        createdAt: item.order.createdAt,
      })),
      lowStockProducts: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        stockQuantity: product.stockQuantity,
        image: product.images[0]?.imageUrl || null,
      })),
      pendingReviews: pendingReviews.map((review) => ({
        id: review.id,
        productName: review.product?.name,
        customerName: review.customer.profile?.fullName || 'Anonymous',
        rating: review.productRating,
        comment: review.comment,
        createdAt: review.createdAt,
      })),
    };
  }

  /**
   * Get seller analytics
   */
  async getSellerAnalytics(sellerId: string, period: string = '30d') {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get order items in period
    const orderItems = await prisma.orderItem.findMany({
      where: {
        sellerId,
        createdAt: { gte: startDate },
      },
      include: {
        order: {
          select: {
            orderStatus: true,
            createdAt: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate revenue
    const completedItems = orderItems.filter(
      (item) => item.order?.orderStatus === 'delivered' || item.order?.orderStatus === 'completed'
    );

    const totalRevenue = completedItems.reduce((sum, item) => {
      return sum + Number(item.sellerPayout);
    }, 0);

    // Period breakdowns for the dashboard's Today / This Week / This Month cards
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sumSince = (since: Date) =>
      completedItems
        .filter((item) => item.order?.createdAt && item.order.createdAt >= since)
        .reduce((sum, item) => sum + Number(item.sellerPayout), 0);

    const countSince = (since: Date) =>
      completedItems
        .filter((item) => item.order?.createdAt && item.order.createdAt >= since)
        .reduce((sum, item) => sum + item.quantity, 0);

    // Calculate daily revenue
    const dailyRevenue: Record<string, number> = {};
    completedItems.forEach((item) => {
      if (item.order?.createdAt) {
        const date = item.order.createdAt.toISOString().split('T')[0];
        dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(item.sellerPayout);
      }
    });

    const revenueGraph = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate order statistics
    const totalOrders = orderItems.length;
    const completedOrders = orderItems.filter(
      (item) => item.order?.orderStatus === 'delivered' || item.order?.orderStatus === 'completed'
    ).length;
    const cancelledOrders = orderItems.filter(
      (item) => item.order?.orderStatus === 'cancelled'
    ).length;

    // Get top products
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    completedItems.forEach((item) => {
      const productId = item.productId || 'unknown';
      const productName = item.product?.name || item.productName;
      if (productId && productId !== 'unknown') {
        if (!productSales[productId]) {
          productSales[productId] = { name: productName, quantity: 0, revenue: 0 };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += Number(item.sellerPayout);
      }
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      sales: {
        today: countSince(dayStart),
        thisWeek: countSince(weekStart),
        thisMonth: countSince(monthStart),
        total: completedItems.reduce((sum, item) => sum + item.quantity, 0),
      },
      revenue: {
        today: sumSince(dayStart),
        thisWeek: sumSince(weekStart),
        thisMonth: sumSince(monthStart),
        total: totalRevenue,
        graph: revenueGraph,
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
      },
      topProducts,
    };
  }

  /**
   * Request payout
   */
  async requestPayout(
    sellerId: string,
    data: {
      amount: number;
      payoutMethod: string;
      accountNumber: string;
    }
  ) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Calculate available balance
    const orderItems = await prisma.orderItem.findMany({
      where: {
        sellerId,
        order: {
          orderStatus: { in: ['delivered', 'completed'] },
        },
      },
    });

    const totalEarnings = orderItems.reduce((sum, item) => {
      return sum + Number(item.sellerPayout);
    }, 0);

    // Get already paid out AND already-requested-but-not-yet-processed amounts —
    // a pending payout must reserve its amount too, or a seller could submit
    // several requests back-to-back before any of them are processed and
    // collectively withdraw more than they've actually earned.
    const outstandingPayouts = await prisma.sellerPayout.findMany({
      where: {
        sellerId,
        status: { in: ['completed', 'pending'] },
      },
      select: {
        netAmount: true,
      },
    });

    const paidOut = outstandingPayouts.reduce((sum, payout) => {
      return sum + Number(payout.netAmount);
    }, 0);

    const availableBalance = totalEarnings - paidOut;

    if (data.amount > availableBalance) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    // Get payout schedule
    const schedule = await prisma.sellerPayoutSchedule.findUnique({
      where: { sellerId },
    });

    const minimumAmount = schedule?.minimumPayoutAmount
      ? Number(schedule.minimumPayoutAmount)
      : await adminService.getSettingValue<number>('minPayoutAmount');

    if (data.amount < minimumAmount) {
      throw new AppError(
        `Minimum payout amount is ${minimumAmount}`,
        400,
        'MINIMUM_PAYOUT_NOT_MET'
      );
    }

    // No further commission here: order_items.seller_payout is already net of the
    // seller's commission_rate at order time (see order.service.ts createOrder),
    // so the requested amount is what the seller actually receives.
    const commissionDeducted = 0;
    const netAmount = data.amount;

    // Create payout request
    const payout = await prisma.sellerPayout.create({
      data: {
        sellerId,
        amount: data.amount,
        commissionDeducted,
        netAmount,
        payoutMethod: data.payoutMethod,
        accountDetails: {
          accountNumber: data.accountNumber,
        },
        status: 'pending',
        periodStart: new Date(),
        periodEnd: new Date(),
      },
    });

    return {
      payoutId: payout.id,
      status: payout.status,
      estimatedProcessing: '2-3 business days',
    };
  }

  /**
   * Get a seller's own payout request history
   */
  async getPayoutHistory(sellerId: string) {
    const payouts = await prisma.sellerPayout.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });

    return payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      netAmount: Number(p.netAmount),
      status: p.status,
      payoutMethod: p.payoutMethod,
      requestedAt: p.createdAt,
      processedAt: p.processedAt,
      failedReason: p.failedReason,
    }));
  }
}

export default new SellerService();

