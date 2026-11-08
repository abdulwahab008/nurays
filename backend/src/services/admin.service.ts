import { Prisma } from '@prisma/client';
import { kitchenApplicationGaps } from '../utils/kitchenApplication';
import prisma from '../config/database';
import { computeSellerBalance } from './seller-balance.service';
import { pageArgs } from '../utils/pagination';
import { AppError } from '../middleware/errorHandler';
import { presentFile } from '../storage';
import { notify, notifySeller } from './notify.service';
import { DELIVERY_SETTING_DEFAULTS, invalidateDeliveryPricing } from './delivery-pricing.service';
import socketManager from '../config/socket';
import { realPhoneOrNull } from '../utils/otp';
import { computeSellerAvailability } from './availability.service';
import { NotificationText, notificationText } from '../utils/notificationText';
import { invalidateCatalogCache } from '../utils/catalogCache';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/** The kitchen's opening hours in a few lines an admin can read at a glance. */
function hoursSummary(scheduleMode: string, operatingHours: unknown): string[] {
  const hours = (operatingHours ?? {}) as {
    fixedDaily?: { open?: string; close?: string };
    weekly?: Partial<Record<(typeof DAY_NAMES)[number], { closed?: boolean; sessions?: Array<{ open?: string; close?: string }> }>>;
  };
  if (scheduleMode === 'fixed_daily' && hours.fixedDaily?.open && hours.fixedDaily.close) {
    return [`Every day, ${hours.fixedDaily.open} to ${hours.fixedDaily.close}`];
  }
  if (scheduleMode === 'per_day' && hours.weekly) {
    return DAY_NAMES.map((day) => {
      const d = hours.weekly?.[day];
      const label = day.charAt(0).toUpperCase() + day.slice(1, 3);
      const sessions = (d?.sessions ?? []).filter((x) => x.open && x.close);
      if (!d || d.closed || sessions.length === 0) return `${label}: closed`;
      return `${label}: ${sessions.map((x) => `${x.open} to ${x.close}`).join(', ')}`;
    });
  }
  return ['Open all day, every day'];
}

/** The last four digits of an account number: enough to recognise it, not enough to use it. */
const maskAccount = (value: string | null | undefined): string | null => {
  const digits = (value ?? '').replace(/\s+/g, '');
  if (!digits) return null;
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
};

/** The community a kitchen is in: the linked record when there is one, else the name the kitchen typed. */
const communityLabel = (seller: { community?: { name: string; city: string } | null; primaryCommunityName: string | null }) =>
  seller.community ? `${seller.community.name}, ${seller.community.city}` : seller.primaryCommunityName;

/** Verification documents with short-lived links an admin can open. */
async function presentDocuments(docs: Array<{ id: string; documentType: string; documentUrl: string; createdAt?: Date; uploadedAt?: Date }>) {
  return Promise.all(
    docs.map(async (d) => ({ id: d.id, type: d.documentType, url: await presentFile(d.documentUrl), uploadedAt: d.createdAt ?? d.uploadedAt ?? null }))
  );
}

const RIDER_REQUIRED_DOCUMENTS = ['cnic_front', 'cnic_back', 'license'];

async function notifySellerOfPayout(sellerId: string, n: { text: NotificationText; dedupeKey: string }) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { userId: true } });
  if (!seller) return;
  await notify({
    userId: seller.userId,
    category: 'payments',
    type: 'payout',
    text: n.text,
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
        community: { select: { name: true, city: true } },
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
      communityId: seller.communityId,
      primaryCommunityName: seller.primaryCommunityName,
      // The same community the "missing" check looks at (communityId), named.
      communityName: communityLabel(seller),
      verificationStatus: seller.verificationStatus,
      latitude: seller.latitude != null ? Number(seller.latitude) : null,
      longitude: seller.longitude != null ? Number(seller.longitude) : null,
      // What the application still lacks (nothing: complete); the screen disables Approve while this is not empty.
      missing: kitchenApplicationGaps(seller, seller.documents.map((d) => d.documentType)),
      documents: await presentDocuments(seller.documents),
      user: {
        id: seller.user.id,
        phone: realPhoneOrNull(seller.user.phone),
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

    // The kitchen is told the reason, so there has to be one. And a kitchen with no community, no place on the map or no
    // CNIC on file cannot be approved: it would be listed nowhere, with nobody known behind it.
    if (!approved) {
      if (!notes || notes.trim().length < 5) throw new AppError('Please tell the kitchen why it was not approved', 400, 'REASON_REQUIRED');
    } else {
      const documentTypes = (await prisma.sellerDocument.findMany({ where: { sellerId }, select: { documentType: true } })).map((d) => d.documentType);
      const missing = kitchenApplicationGaps(seller, documentTypes);
      if (missing.length > 0) {
        throw new AppError(`This kitchen has not sent its ${missing.join(', ')} yet`, 409, 'APPLICATION_INCOMPLETE', { missing });
      }
    }

    const updatedSeller = await prisma.seller.update({
      where: { id: sellerId },
      data: {
        verificationStatus: approved ? 'approved' : 'rejected',
        isVerified: approved,
        status: approved ? 'active' : 'inactive',
        rejectionReason: approved ? null : notes!.trim(),
      },
    });

    // Update user type if approved
    if (approved) {
      await prisma.user.update({
        where: { id: seller.userId },
        data: { userType: 'seller' },
      });
    }

    void notify({
      userId: seller.userId,
      category: 'orders',
      type: 'account',
      text: approved ? notificationText('kitchen.approved', {}) : notificationText('kitchen.rejected', { reason: notes!.trim() }),
      actionUrl: '/sellers/dashboard',
      data: { sellerId },
      channels: ['push', 'email'],
      dedupeKey: `seller-review:${sellerId}:${approved ? 'approved' : 'rejected'}`,
    });

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
        community: { select: { name: true, city: true } },
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

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [productCount, liveDishes, dishes, recentOrders, sales30d] = await Promise.all([
      prisma.product.count({ where: { sellerId: seller.id } }),
      prisma.product.count({ where: { sellerId: seller.id, approvalStatus: 'approved', isActive: true } }),
      prisma.product.findMany({
        where: { sellerId: seller.id },
        orderBy: [{ approvalStatus: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        select: { id: true, name: true, price: true, isActive: true, approvalStatus: true },
      }),
      prisma.order.findMany({
        where: { items: { some: { sellerId: seller.id } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          createdAt: true,
          items: { where: { sellerId: seller.id }, select: { totalPrice: true } },
        },
      }),
      // What this kitchen sold in the last 30 days: its own items on orders that were not cancelled.
      prisma.$queryRaw<Array<{ orders: bigint; sales: Prisma.Decimal | null }>>`
        SELECT COUNT(DISTINCT oi.order_id) AS orders, SUM(oi.total_price) AS sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.seller_id = ${seller.id}
          AND o.created_at >= ${since}
          AND o.order_status <> 'cancelled'
      `,
    ]);

    const availability = computeSellerAvailability(seller);

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
      communityId: seller.communityId,
      primaryCommunityName: seller.primaryCommunityName,
      communityName: communityLabel(seller),
      missing: kitchenApplicationGaps(seller, seller.documents.map((d) => d.documentType)),
      documents: await presentDocuments(seller.documents),
      figures: {
        orders30d: Number(sales30d[0]?.orders ?? 0),
        sales30d: Number(sales30d[0]?.sales ?? 0),
        ratingAverage: Number(seller.ratingAverage),
        totalReviews: seller.totalReviews,
        liveDishes,
        totalDishes: productCount,
      },
      kitchen: {
        isOpen: availability.isOpen,
        availability: availability.status,
        availabilityNote: availability.isManualOverride ? availability.reason : null,
        hours: hoursSummary(seller.scheduleMode, seller.operatingHours),
        deliveryModes: seller.deliveryModes,
        deliveryProvider: seller.deliveryProvider,
        pickupAddress: seller.pickupAddress,
        pickupLandmark: seller.pickupLandmark,
        pickupPhone: realPhoneOrNull(seller.pickupPhone),
        latitude: seller.latitude != null ? Number(seller.latitude) : null,
        longitude: seller.longitude != null ? Number(seller.longitude) : null,
      },
      dishes: dishes.map((d) => ({
        id: d.id,
        name: d.name,
        price: Number(d.price),
        isActive: d.isActive,
        moderationStatus: d.approvalStatus,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        kitchenTotal: o.items.reduce((sum, i) => sum + Number(i.totalPrice), 0),
      })),
      payoutAccount: {
        bankName: seller.bankName,
        bankAccountName: seller.bankAccountName,
        bankAccountNumber: maskAccount(seller.bankAccountNumber),
        jazzcashNumber: maskAccount(seller.jazzcashNumber),
        easypaisaNumber: maskAccount(seller.easypaisaNumber),
      },
      user: {
        id: seller.user.id,
        email: seller.user.email,
        phone: realPhoneOrNull(seller.user.phone),
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
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const where: Prisma.SellerWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }

    const search = filters.search?.trim().slice(0, 100);
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { primaryCommunityName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
        { user: { profile: { fullName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    // Counts for the tabs, under the same search: every kitchen, by verification, and the suspended ones.
    const searchOnly: Prisma.SellerWhereInput = search ? { OR: where.OR } : {};
    const [sellers, total, byVerification, suspended] = await Promise.all([
      prisma.seller.findMany({
        where,
        skip,
        take: limit,
        include: {
          community: { select: { name: true, city: true } },
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
      prisma.seller.groupBy({ by: ['verificationStatus'], where: searchOnly, _count: { _all: true } }),
      prisma.seller.count({ where: { ...searchOnly, status: 'suspended' } }),
    ]);

    const ids = sellers.map((s) => s.id);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [dishCounts, liveCounts, orderCounts] = ids.length
      ? await Promise.all([
          prisma.product.groupBy({ by: ['sellerId'], where: { sellerId: { in: ids } }, _count: { _all: true } }),
          prisma.product.groupBy({
            by: ['sellerId'],
            where: { sellerId: { in: ids }, approvalStatus: 'approved', isActive: true },
            _count: { _all: true },
          }),
          prisma.$queryRaw<Array<{ seller_id: string; orders: bigint }>>`
            SELECT oi.seller_id, COUNT(DISTINCT oi.order_id) AS orders
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.seller_id IN (${Prisma.join(ids)})
              AND o.created_at >= ${since}
              AND o.order_status <> 'cancelled'
            GROUP BY oi.seller_id
          `,
        ])
      : [[], [], []];
    const dishesBy = new Map(dishCounts.map((d) => [d.sellerId, d._count._all]));
    const liveBy = new Map(liveCounts.map((d) => [d.sellerId, d._count._all]));
    const ordersBy = new Map(orderCounts.map((o) => [o.seller_id, Number(o.orders)]));
    const countOf = (v: string) => byVerification.find((b) => b.verificationStatus === v)?._count._all ?? 0;

    return {
      sellers: sellers.map((seller) => ({
        id: seller.id,
        businessName: seller.businessName,
        businessNameUrdu: seller.businessNameUrdu,
        verificationStatus: seller.verificationStatus,
        status: seller.status,
        createdAt: seller.createdAt,
        communityName: communityLabel(seller),
        isOpen: computeSellerAvailability(seller).isOpen,
        ratingAverage: Number(seller.ratingAverage),
        totalReviews: seller.totalReviews,
        totalDishes: dishesBy.get(seller.id) ?? 0,
        liveDishes: liveBy.get(seller.id) ?? 0,
        orders30d: ordersBy.get(seller.id) ?? 0,
        user: {
          email: seller.user.email,
          phone: realPhoneOrNull(seller.user.phone),
          profile: seller.user.profile
            ? {
                fullName: seller.user.profile.fullName,
              }
            : null,
        },
      })),
      counts: {
        all: byVerification.reduce((n, b) => n + b._count._all, 0),
        approved: countOf('approved'),
        pending: countOf('pending'),
        rejected: countOf('rejected'),
        suspended,
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
   * Moderate product (approve/reject)
   */
  async moderateProduct(
    productId: string,
    _adminId: string,
    approved: boolean,
    reason?: string
  ) {
    // The kitchen is told the reason, so there has to be one (as for a kitchen or a rider that is turned down).
    if (!approved && (!reason || reason.trim().length < 5)) {
      throw new AppError('Say why the dish is not approved (at least 5 characters), so the kitchen knows what to fix.', 400, 'REASON_REQUIRED');
    }
    const why = reason?.trim();

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
        rejectionReason: approved ? null : why,
      },
    });
    await invalidateCatalogCache();

    await notifySeller(product.sellerId, approved
      ? { text: notificationText('dish.approved', { name: product.name }), actionUrl: `/products/${product.id}`, dedupeKey: `product:${product.id}:approved:${Date.now()}` }
      : { text: notificationText('dish.rejected', { name: product.name, reason: why! }), actionUrl: `/sellers/products/${product.id}/edit`, dedupeKey: `product:${product.id}:rejected:${Date.now()}` });

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
              phone: realPhoneOrNull(user.phone),
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
    // The rider is told the reason, so there has to be one.
    if (!approved && (!reason || reason.trim().length < 5)) {
      throw new AppError('Please tell the rider why the application was not approved', 400, 'REASON_REQUIRED');
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
        rejectionReason: approved ? null : reason!.trim(),
      },
    });
    // A rider is on duty by default: once approved they hear about jobs in the pool, rejected they do not.
    void socketManager.syncRiderDuty(rider.userId);

    void notify({
      userId: rider.userId,
      category: 'deliveries',
      type: 'account',
      text: approved ? notificationText('rider.approved', {}) : notificationText('rider.rejected', { reason: reason!.trim() }),
      actionUrl: '/riders/dashboard',
      data: { riderId },
      channels: ['push', 'email'],
      dedupeKey: `rider-review:${riderId}:${approved ? 'approved' : 'rejected'}`,
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

    void notify({
      userId: seller.userId,
      category: 'orders',
      type: 'account',
      text: notificationText(status === 'suspended' ? 'kitchen.suspended' : 'kitchen.reactivated', {}),
      actionUrl: '/sellers/dashboard',
      data: { sellerId },
      channels: ['push', 'email'],
      dedupeKey: `seller-status:${sellerId}:${status}:${Date.now()}`,
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
    search?: string;
    sellerId?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const scope: Prisma.ProductWhereInput = {};
    if (filters.sellerId) scope.sellerId = filters.sellerId;
    const search = filters.search?.trim().slice(0, 100);
    if (search) {
      scope.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { seller: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const where: Prisma.ProductWhereInput = { ...scope };
    if (filters.status) {
      where.approvalStatus = filters.status;
    }

    const [products, total, byStatus] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        // The oldest waiting dish first when reviewing; newest first otherwise.
        orderBy: { createdAt: filters.status === 'pending' ? 'asc' : 'desc' },
        include: {
          seller: { select: { id: true, businessName: true } },
          category: { select: { name: true } },
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, price: true, weightGrams: true } },
        },
      }),
      prisma.product.count({ where }),
      prisma.product.groupBy({ by: ['approvalStatus'], where: scope, _count: { _all: true } }),
    ]);
    const countOf = (v: string) => byStatus.find((b) => b.approvalStatus === v)?._count._all ?? 0;

    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        isActive: p.isActive,
        moderationStatus: p.approvalStatus,
        rejectionReason: p.rejectionReason,
        description: p.description,
        category: p.category?.name ?? null,
        productType: p.productType,
        unit: p.unit,
        weightGrams: p.weightGrams,
        preparationTime: p.preparationTime,
        ingredients: p.ingredients,
        allergens: p.allergens,
        dietaryInfo: p.dietaryInfo,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        seller: { id: p.seller.id, businessName: p.seller.businessName },
        images: p.images.map((img) => ({ imageUrl: img.imageUrl, isPrimary: img.isPrimary })),
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price), weightGrams: v.weightGrams })),
      })),
      counts: {
        all: byStatus.reduce((n, b) => n + b._count._all, 0),
        pending: countOf('pending'),
        approved: countOf('approved'),
        rejected: countOf('rejected'),
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
   * List seller payout requests (admin only)
   */
  async getPayouts(filters: { status?: string; page?: number; limit?: number }) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

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
        periodStart: p.periodStart.toISOString().slice(0, 10),
        periodEnd: p.periodEnd.toISOString().slice(0, 10),
        automatic: (p.accountDetails as { automatic?: unknown } | null)?.automatic === true,
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
    // succeed — money marked sent and failed at once lets the seller request it again. The
    // balance is re-checked under the seller's lock first: a refund that landed after the request
    // can mean the money is no longer the seller's to receive.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${payout.sellerId} FOR NO KEY UPDATE`;
      const balance = await computeSellerBalance(tx, payout.sellerId);
      if (balance.available < 0) {
        throw new AppError(
          `The kitchen's balance no longer covers this payout (short by Rs ${Math.abs(balance.available)}, usually a refund since the request). Fail the payout instead.`,
          409,
          'PAYOUT_EXCEEDS_BALANCE'
        );
      }
      const claimed = await tx.sellerPayout.updateMany({
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
    });
    await notifySellerOfPayout(payout.sellerId, {
      text: notificationText('payout.sent', { amount: `Rs ${Number(payout.netAmount ?? payout.amount).toLocaleString()}`, transactionId: transactionId || null }),
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
      text: notificationText('payout.failed', { amount: `Rs ${Number(payout.netAmount ?? payout.amount).toLocaleString()}`, reason }),
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
    // Every Monday each kitchen's balance becomes a payout by itself (weekly-payout.service.ts).
    weeklyPayouts: true,
    // Nuray rider delivery to other communities (see delivery-pricing.service.ts).
    ...DELIVERY_SETTING_DEFAULTS,
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
    const limits: Record<string, [number, number]> = {
      deliveryPerKm: [0, 1000],
      deliveryIncludedKm: [0, 100],
      deliveryMaxKm: [1, 200],
      deliveryFallbackFee: [0, 5000],
    };
    for (const key of keys) {
      if (!(key in limits)) continue;
      const v = Number(data[key]);
      const [lo, hi] = limits[key];
      if (!Number.isFinite(v) || v < lo || v > hi) throw new AppError(`${key} must be between ${lo} and ${hi}`, 400, 'INVALID_SETTING');
      data[key] = v;
    }
    // All of them or none: the settings belong together (the delivery prices, the commission), and a save that stopped half way
    // must not leave some of the boxes the admin filled in applied and others not.
    await prisma.$transaction(
      keys.map((key) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: data[key] as Prisma.InputJsonValue, updatedBy: adminId },
          update: { value: data[key] as Prisma.InputJsonValue, updatedBy: adminId },
        })
      )
    );
    if (keys.some((k) => k in DELIVERY_SETTING_DEFAULTS)) invalidateDeliveryPricing();
    return this.getSettings();
  }
}

export default new AdminService();

