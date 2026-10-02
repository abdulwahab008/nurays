import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { presentFile } from '../storage';
import { notify, notifySeller } from './notify.service';

/** Verification documents with short-lived links an admin can open. */
async function presentDocuments(docs: Array<{ id: string; documentType: string; documentUrl: string; createdAt?: Date; uploadedAt?: Date }>) {
  return Promise.all(
    docs.map(async (d) => ({ id: d.id, type: d.documentType, url: await presentFile(d.documentUrl), uploadedAt: d.createdAt ?? d.uploadedAt ?? null }))
  );
}

const RIDER_REQUIRED_DOCUMENTS = ['cnic_front', 'cnic_back', 'license'];

async function notifySellerOfPayout(sellerId: string, n: { title: string; message: string; dedupeKey: string }) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { userId: true } });
  if (!seller) return;
  await notify({
    userId: seller.userId,
    category: 'payments',
    type: 'payout',
    title: n.title,
    message: n.message,
    actionUrl: '/sellers/earnings',
    channels: ['push', 'email'],
    dedupeKey: n.dedupeKey,
  });
}

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
        documents: true,
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

    return Promise.all(sellers.map(async (seller) => ({
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      primaryCommunityName: seller.primaryCommunityName,
      latitude: seller.latitude != null ? Number(seller.latitude) : null,
      longitude: seller.longitude != null ? Number(seller.longitude) : null,
      documents: await presentDocuments(seller.documents),
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
    })));
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
        documents: true,
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
      documents: await presentDocuments(seller.documents),
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

    const where: Prisma.SellerWhereInput = {};

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

    await notifySeller(product.sellerId, approved
      ? { title: 'Dish approved', message: `"${product.name}" is live. Customers can order it now.`, actionUrl: `/products/${product.id}`, dedupeKey: `product:${product.id}:approved:${Date.now()}` }
      : { title: 'Dish not approved', message: `"${product.name}" wasn't approved: ${reason || 'Product rejected'}`, actionUrl: `/sellers/products/${product.id}/edit`, dedupeKey: `product:${product.id}:rejected:${Date.now()}` });

    return {
      productId: updatedProduct.id,
      approvalStatus: updatedProduct.approvalStatus,
      isActive: updatedProduct.isActive,
      message: approved ? 'Product approved' : 'Product rejected',
    };
  }

  /**
   * Get riders awaiting admin approval before they can see or claim deliveries.
   */
  async getPendingRiders() {
    const riders = await prisma.rider.findMany({
      where: { verificationStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { documents: true },
    });

    // Rider has no `user` relation in the schema (only a scalar userId), so
    // author info is resolved with a separate batch lookup.
    const userIds = riders.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      include: { profile: { select: { fullName: true, city: true } } },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return Promise.all(riders.map(async (rider) => {
      const user = userById.get(rider.userId);
      const types = new Set(rider.documents.map((d) => d.documentType));
      return {
        id: rider.id,
        city: rider.city,
        vehicleType: rider.vehicleType,
        vehicleNumber: rider.vehicleNumber,
        licenseNumber: rider.licenseNumber,
        documents: await presentDocuments(rider.documents),
        // Vehicle and every required document: only then can it be approved.
        applicationComplete: !!rider.vehicleType && !!rider.vehicleNumber && RIDER_REQUIRED_DOCUMENTS.every((t) => types.has(t)),
        user: user
          ? {
              id: user.id,
              phone: user.phone,
              email: user.email,
              profile: user.profile
                ? { fullName: user.profile.fullName, city: user.profile.city }
                : null,
            }
          : null,
        createdAt: rider.createdAt,
      };
    }));
  }

  /**
   * Approve or reject a rider application. A rejected rider cannot see or
   * claim any delivery (enforced in rider.service.ts's requireRider).
   */
  async approveRejectRider(riderId: string, approved: boolean, reason?: string) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) {
      throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
    }
    if (rider.verificationStatus !== 'pending') {
      throw new AppError(`Rider already ${rider.verificationStatus}`, 400, 'RIDER_ALREADY_PROCESSED');
    }
    // Approval needs the rider's vehicle and documents on file.
    if (approved) {
      const types = new Set((await prisma.riderDocument.findMany({ where: { riderId }, select: { documentType: true } })).map((d) => d.documentType));
      if (!rider.vehicleType || !rider.vehicleNumber || !RIDER_REQUIRED_DOCUMENTS.every((t) => types.has(t))) {
        throw new AppError("This rider hasn't sent their vehicle details and CNIC / licence photos yet", 409, 'APPLICATION_INCOMPLETE');
      }
    }

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: {
        verificationStatus: approved ? 'approved' : 'rejected',
        status: approved ? 'active' : 'suspended',
        rejectionReason: approved ? null : reason || 'Application rejected',
      },
    });

    return {
      riderId: updated.id,
      verificationStatus: updated.verificationStatus,
      status: updated.status,
      message: approved ? 'Rider approved successfully' : 'Rider rejected',
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

    const where: Prisma.ProductWhereInput = {};
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

    const where: Prisma.SellerPayoutWhereInput = {};
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

    // Conditional on still being pending: a concurrent fail (or second complete) must not also
    // succeed — money marked sent and failed at once lets the seller request it again.
    const claimed = await prisma.sellerPayout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: {
        status: 'completed',
        transactionId: transactionId || null,
        processedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new AppError('Payout is no longer pending', 409, 'PAYOUT_NOT_PENDING');
    }
    await notifySellerOfPayout(payout.sellerId, {
      title: 'Payout sent',
      message: `We sent your payout of Rs ${Number(payout.netAmount ?? payout.amount).toLocaleString()}${transactionId ? ` (transaction ${transactionId})` : ''}.`,
      dedupeKey: `payout:${payoutId}:completed`,
    });

    return { payoutId, status: 'completed' };
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

    const claimed = await prisma.sellerPayout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: {
        status: 'failed',
        failedReason: reason,
        processedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new AppError('Payout is no longer pending', 409, 'PAYOUT_NOT_PENDING');
    }
    await notifySellerOfPayout(payout.sellerId, {
      title: "Your payout didn't go through",
      message: `Your payout of Rs ${Number(payout.netAmount ?? payout.amount).toLocaleString()} could not be sent: ${reason}. The amount is back in your balance; check your payout details and request it again.`,
      dedupeKey: `payout:${payoutId}:failed`,
    });

    return { payoutId, status: 'failed' };
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

  /** A single platform setting (falls back to its default if never saved). */
  async getSettingValue<T>(key: keyof typeof AdminService.SETTINGS_DEFAULTS): Promise<T> {
    const settings = await this.getSettings();
    return settings[key] as T;
  }

  async updateSettings(data: Record<string, unknown>, adminId: string) {
    const keys = Object.keys(data).filter((k) => k in AdminService.SETTINGS_DEFAULTS);
    await Promise.all(
      keys.map((key) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: data[key] as Prisma.InputJsonValue, updatedBy: adminId },
          update: { value: data[key] as Prisma.InputJsonValue, updatedBy: adminId },
        })
      )
    );
    return this.getSettings();
  }
}

export default new AdminService();

