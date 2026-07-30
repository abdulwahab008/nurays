import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class AdminService {
  /**
   * Get pending sellers
   */
  async getPendingSellers() {
    const sellers = await prisma.seller.findMany({
      where: {
        verificationStatus: 'pending',
      },
      include: {
        user: {
          include: {
            profile: {
              select: {
                fullName: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return sellers.map((seller) => ({
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      user: {
        id: seller.user.id,
        phone: seller.user.phone,
        email: seller.user.email,
        profile: seller.user.profile
          ? {
              fullName: seller.user.profile.fullName,
              city: seller.user.profile.city,
            }
          : null,
      },
      createdAt: seller.createdAt,
    }));
  }

  /**
   * Approve or reject seller
   */
  async approveRejectSeller(
    sellerId: string,
    _adminId: string,
    approved: boolean,
    notes?: string
  ) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    if (seller.verificationStatus !== 'pending') {
      throw new AppError(
        `Seller already ${seller.verificationStatus}`,
        400,
        'SELLER_ALREADY_PROCESSED'
      );
    }

    const updatedSeller = await prisma.seller.update({
      where: { id: sellerId },
      data: {
        verificationStatus: approved ? 'approved' : 'rejected',
        isVerified: approved,
        status: approved ? 'active' : 'inactive',
        rejectionReason: approved ? null : notes || 'Application rejected',
      },
    });

    // Update user type if approved
    if (approved) {
      await prisma.user.update({
        where: { id: seller.userId },
        data: { userType: 'seller' },
      });
    }

    return {
      sellerId: updatedSeller.id,
      verificationStatus: updatedSeller.verificationStatus,
      isVerified: updatedSeller.isVerified,
      status: updatedSeller.status,
      message: approved ? 'Seller approved successfully' : 'Seller rejected',
    };
  }

  /**
   * Get one seller by ID (admin)
   */
  async getSellerById(sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      include: {
        user: {
          include: {
            profile: {
              select: {
                fullName: true,
                city: true,
                area: true,
              },
            },
          },
        },
      },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const productCount = await prisma.product.count({
      where: { sellerId: seller.id },
    });

    return {
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      verificationStatus: seller.verificationStatus,
      status: seller.status,
      rejectionReason: seller.rejectionReason,
      isVerified: seller.isVerified,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      productCount,
      user: {
        id: seller.user.id,
        email: seller.user.email,
        phone: seller.user.phone,
        profile: seller.user.profile
          ? {
              fullName: seller.user.profile.fullName,
              city: seller.user.profile.city,
              area: seller.user.profile.area,
            }
          : null,
      },
    };
  }

  /**
   * Get all sellers (with optional filtering)
   */
  async getAllSellers(filters: {
    status?: string;
    verificationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }

    const [sellers, total] = await Promise.all([
      prisma.seller.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.seller.count({ where }),
    ]);

    return {
      sellers: sellers.map((seller) => ({
        id: seller.id,
        businessName: seller.businessName,
        businessNameUrdu: seller.businessNameUrdu,
        verificationStatus: seller.verificationStatus,
        status: seller.status,
        createdAt: seller.createdAt,
        user: {
          email: seller.user.email,
          phone: seller.user.phone,
          profile: seller.user.profile
            ? {
                fullName: seller.user.profile.fullName,
              }
            : null,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Moderate product (approve/reject)
   */
  async moderateProduct(
    productId: string,
    _adminId: string,
    approved: boolean,
    reason?: string
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        approvalStatus: approved ? 'approved' : 'rejected',
        isActive: approved,
        rejectionReason: approved ? null : reason || 'Product rejected',
      },
    });

    return {
      productId: updatedProduct.id,
      approvalStatus: updatedProduct.approvalStatus,
      isActive: updatedProduct.isActive,
      message: approved ? 'Product approved' : 'Product rejected',
    };
  }

  /**
   * Suspend or reactivate an already-approved seller (trust & safety action,
   * distinct from the pending-application approve/reject flow).
   */
  async updateSellerStatus(sellerId: string, status: 'active' | 'suspended') {
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const updated = await prisma.seller.update({
      where: { id: sellerId },
      data: { status },
    });

    return {
      sellerId: updated.id,
      status: updated.status,
      message: status === 'suspended' ? 'Seller suspended' : 'Seller reactivated',
    };
  }

  /**
   * List products for moderation (admin only)
   */
  async getProductsForModeration(filters: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) {
      where.approvalStatus = filters.status;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { businessName: true } },
          images: { where: { isPrimary: true }, take: 1 },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        isActive: p.isActive,
        moderationStatus: p.approvalStatus,
        seller: { businessName: p.seller.businessName },
        images: p.images.map((img) => ({ imageUrl: img.imageUrl, isPrimary: img.isPrimary })),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List seller payout requests (admin only)
   */
  async getPayouts(filters: { status?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) {
      where.status = filters.status;
    }

    const [payouts, total] = await Promise.all([
      prisma.sellerPayout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { id: true, businessName: true } },
        },
      }),
      prisma.sellerPayout.count({ where }),
    ]);

    return {
      payouts: payouts.map((p) => ({
        id: p.id,
        seller: p.seller,
        amount: Number(p.amount),
        netAmount: Number(p.netAmount),
        payoutMethod: p.payoutMethod,
        accountDetails: p.accountDetails,
        status: p.status,
        failedReason: p.failedReason,
        requestedAt: p.createdAt,
        processedAt: p.processedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a pending payout as completed (admin only)
   */
  async completePayout(payoutId: string, transactionId?: string) {
    const payout = await prisma.sellerPayout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      throw new AppError('Payout not found', 404, 'PAYOUT_NOT_FOUND');
    }
    if (payout.status !== 'pending') {
      throw new AppError(`Payout is already ${payout.status}`, 400, 'PAYOUT_NOT_PENDING');
    }

    const updated = await prisma.sellerPayout.update({
      where: { id: payoutId },
      data: {
        status: 'completed',
        transactionId: transactionId || null,
        processedAt: new Date(),
      },
    });

    return { payoutId: updated.id, status: updated.status };
  }

  /**
   * Mark a pending payout as failed (admin only)
   */
  async failPayout(payoutId: string, reason: string) {
    const payout = await prisma.sellerPayout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      throw new AppError('Payout not found', 404, 'PAYOUT_NOT_FOUND');
    }
    if (payout.status !== 'pending') {
      throw new AppError(`Payout is already ${payout.status}`, 400, 'PAYOUT_NOT_PENDING');
    }

    const updated = await prisma.sellerPayout.update({
      where: { id: payoutId },
      data: {
        status: 'failed',
        failedReason: reason,
        processedAt: new Date(),
      },
    });

    return { payoutId: updated.id, status: updated.status };
  }

  /**
   * Platform-wide settings (key/value in system_settings), with sensible defaults
   * for any key that's never been saved yet.
   */
  private static readonly SETTINGS_DEFAULTS: Record<string, unknown> = {
    platformName: 'Nuray',
    supportEmail: 'support@nuray.pk',
    supportPhone: '+92-300-1234567',
    commissionRate: 15,
    minPayoutAmount: 1000,
  };

  async getSettings() {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: Object.keys(AdminService.SETTINGS_DEFAULTS) } },
    });
    const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...AdminService.SETTINGS_DEFAULTS, ...saved };
  }

  async updateSettings(data: Record<string, unknown>, adminId: string) {
    const keys = Object.keys(data).filter((k) => k in AdminService.SETTINGS_DEFAULTS);
    await Promise.all(
      keys.map((key) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: data[key] as any, updatedBy: adminId },
          update: { value: data[key] as any, updatedBy: adminId },
        })
      )
    );
    return this.getSettings();
  }
}

export default new AdminService();

