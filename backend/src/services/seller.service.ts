import prisma from '../config/database';
import { getPlatformDeliveryPricing } from './delivery-pricing.service';
import { platformDeliveryFee } from '../utils/deliveryFee';
import { AppError } from '../middleware/errorHandler';
import adminService from './admin.service';
import { computeSellerAvailability } from './availability.service';
import { computeSellerBalance } from './seller-balance.service';
import { assertOwnDocument, assertOwnPublicImage } from '../utils/documents';

/** Shared shape for the business-operations fields — read by getSellerProfile, written by updateSellerProfile. */
function formatBusinessOperationsFields(seller: {
  distancePricingTiers: unknown;
  maxDeliveryDistanceKm: number | null;
  minOrderAmountForDelivery: unknown;
  freeDeliveryThreshold: unknown;
  allowedPostalCodes: string[];
  deliveryZones: unknown;
  deliveryModes: string[];
  businessType: string;
  mealCategories: string[];
  storeNotice: string | null;
  scheduleMode: string;
  operatingHours: unknown;
  availabilityOverride: string | null;
  availabilityOverrideUntil: Date | null;
  availabilityNote: string | null;
  orderCutoffTime: string | null;
  maxDailyOrders: number | null;
  minPrepTimeMinutes: number | null;
  preOrderOnly: boolean;
  advanceBookingMinDays: number | null;
  advanceBookingMaxDays: number | null;
  status: string;
}) {
  return {
    distancePricingTiers: seller.distancePricingTiers ?? null,
    maxDeliveryDistanceKm: seller.maxDeliveryDistanceKm,
    minOrderAmountForDelivery: seller.minOrderAmountForDelivery != null ? Number(seller.minOrderAmountForDelivery) : null,
    freeDeliveryThreshold: seller.freeDeliveryThreshold != null ? Number(seller.freeDeliveryThreshold) : null,
    allowedPostalCodes: seller.allowedPostalCodes,
    deliveryZones: seller.deliveryZones ?? null,
    deliveryModes: seller.deliveryModes,
    businessType: seller.businessType,
    mealCategories: seller.mealCategories,
    storeNotice: seller.storeNotice,
    scheduleMode: seller.scheduleMode,
    operatingHours: seller.operatingHours ?? null,
    availabilityOverride: seller.availabilityOverride,
    availabilityOverrideUntil: seller.availabilityOverrideUntil,
    availabilityNote: seller.availabilityNote,
    orderCutoffTime: seller.orderCutoffTime,
    maxDailyOrders: seller.maxDailyOrders,
    minPrepTimeMinutes: seller.minPrepTimeMinutes,
    preOrderOnly: seller.preOrderOnly,
    advanceBookingMinDays: seller.advanceBookingMinDays,
    advanceBookingMaxDays: seller.advanceBookingMaxDays,
    availability: computeSellerAvailability(seller),
  };
}

/** A seller's documents of each given type are replaced by the new ones (null: left as they are). */
async function replaceSellerDocuments(sellerId: string, docs: Record<string, string[] | null>) {
  for (const [documentType, urls] of Object.entries(docs)) {
    if (!urls) continue;
    await prisma.$transaction([
      prisma.sellerDocument.deleteMany({ where: { sellerId, documentType } }),
      prisma.sellerDocument.createMany({ data: urls.map((documentUrl) => ({ sellerId, documentType, documentUrl })) }),
    ]);
  }
}

export class SellerService {
  /**
   * Register as seller
   */
  async registerAsSeller(
    userId: string,
    data: {
      businessName: string;
      businessNameUrdu?: string;
      businessType?: string;
      description?: string;
      kitchenVideoUrl?: string;
      coverImageUrl?: string;
      cnicFrontUrl?: string;
      cnicBackUrl?: string;
      kitchenPhotoUrls?: string[];
      communityId?: string;
      primaryCommunityName?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
      mealCategories?: string[];
      deliveryModes?: string[];
      bankAccountName?: string;
      bankAccountNumber?: string;
      bankName?: string;
      jazzcashNumber?: string;
      easypaisaNumber?: string;
      agreeToTerms?: boolean;
    }
  ) {
    // Check if user already has a seller account
    const existingSeller = await prisma.seller.findUnique({
      where: { userId },
    });

    // Only a rejected application can be sent again.
    if (existingSeller && existingSeller.verificationStatus !== 'rejected') {
      throw new AppError('Seller account already exists', 400, 'SELLER_ALREADY_EXISTS');
    }

    // Identity documents and photos must be files this user uploaded here, never links from
    // elsewhere. A first application needs both sides of the CNIC; a resubmission keeps the
    // ones already on file unless new ones are sent.
    const cnicFront = data.cnicFrontUrl ? assertOwnDocument(data.cnicFrontUrl, userId, 'front of your CNIC') : null;
    const cnicBack = data.cnicBackUrl ? assertOwnDocument(data.cnicBackUrl, userId, 'back of your CNIC') : null;
    const kitchenPhotos = (data.kitchenPhotoUrls ?? []).slice(0, 6).map((url) => assertOwnDocument(url, userId, 'kitchen photo'));
    const coverImageUrl =
      data.coverImageUrl && data.coverImageUrl !== existingSeller?.coverImageUrl
        ? assertOwnPublicImage(data.coverImageUrl, userId, 'covers', 'cover photo')
        : data.coverImageUrl || existingSeller?.coverImageUrl || undefined;
    const cnicOnFile = existingSeller
      ? await prisma.sellerDocument.count({ where: { sellerId: existingSeller.id, documentType: { in: ['cnic_front', 'cnic_back'] } } })
      : 0;
    if ((!cnicFront || !cnicBack) && cnicOnFile < 2) {
      throw new AppError('Please upload photos of both sides of your CNIC.', 400, 'CNIC_REQUIRED');
    }
    const saveDocuments = (sellerId: string) =>
      replaceSellerDocuments(sellerId, { cnic_front: cnicFront ? [cnicFront] : null, cnic_back: cnicBack ? [cnicBack] : null, kitchen_photo: kitchenPhotos.length ? kitchenPhotos : null });

    if (existingSeller) {
      // Previously rejected: the application is sent again with the details fixed.
      const updated = await prisma.seller.update({
        where: { id: existingSeller.id },
        data: {
          businessName: data.businessName,
          businessNameUrdu: data.businessNameUrdu,
          businessType: data.businessType || existingSeller.businessType || 'home_kitchen',
          description: data.description,
          kitchenVideoUrl: data.kitchenVideoUrl,
          coverImageUrl,
          communityId: data.communityId,
          primaryCommunityName: data.primaryCommunityName,
          latitude: data.latitude !== undefined ? data.latitude : existingSeller.latitude,
          longitude: data.longitude !== undefined ? data.longitude : existingSeller.longitude,
          mealCategories: data.mealCategories || existingSeller.mealCategories,
          deliveryModes: data.deliveryModes || existingSeller.deliveryModes,
          bankAccountName: data.bankAccountName,
          bankAccountNumber: data.bankAccountNumber,
          bankName: data.bankName,
          jazzcashNumber: data.jazzcashNumber,
          easypaisaNumber: data.easypaisaNumber,
          verificationStatus: 'pending',
          rejectionReason: null,
        },
      });

      await saveDocuments(updated.id);

      return {
        sellerId: updated.id,
        verificationStatus: updated.verificationStatus,
        message: 'Application resubmitted for review',
      };
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Only a customer account can become a seller. This used to overwrite the
    // role of any logged-in user, so a rider, hub manager or admin could be
    // silently demoted to (or hijacked as) a seller.
    if (!['customer', 'seller'].includes(user.userType)) {
      throw new AppError('This account type cannot register as a seller', 403, 'ROLE_NOT_ALLOWED');
    }

    const commissionRate = await adminService.getSettingValue<number>('commissionRate');
    const seller = await prisma.seller.create({
      data: {
        userId,
        businessName: data.businessName,
        businessNameUrdu: data.businessNameUrdu,
        businessType: data.businessType || 'home_kitchen',
        description: data.description,
        kitchenVideoUrl: data.kitchenVideoUrl,
        coverImageUrl,
        communityId: data.communityId,
        primaryCommunityName: data.primaryCommunityName,
        latitude: data.latitude,
        longitude: data.longitude,
        mealCategories: data.mealCategories || [],
        deliveryModes: data.deliveryModes || ['delivery', 'pickup'],
        bankAccountName: data.bankAccountName,
        bankAccountNumber: data.bankAccountNumber,
        bankName: data.bankName,
        jazzcashNumber: data.jazzcashNumber,
        easypaisaNumber: data.easypaisaNumber,
        commissionRate,
        verificationStatus: 'pending',
      },
    });

    await saveDocuments(seller.id);

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
      jazzcashAccountTitle: seller.jazzcashAccountTitle,
      easypaisaNumber: seller.easypaisaNumber,
      easypaisaAccountTitle: seller.easypaisaAccountTitle,
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
      deliveryProvider: seller.deliveryProvider,
      communityId: seller.communityId,
      allowCrossCommunity: seller.allowCrossCommunity,
      verificationStatus: seller.verificationStatus,
      status: seller.status,
      isVerified: seller.isVerified,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      ...formatBusinessOperationsFields(seller),
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
      jazzcashAccountTitle?: string;
      easypaisaNumber?: string;
      easypaisaAccountTitle?: string;
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
      distancePricingTiers?: Array<{ maxKm: number; fee: number }> | null;
      maxDeliveryDistanceKm?: number | null;
      minOrderAmountForDelivery?: number | null;
      freeDeliveryThreshold?: number | null;
      allowedPostalCodes?: string[];
      deliveryZones?: Array<{ name: string; cities: string[]; areas: string[]; fee: number }> | null;
      deliveryModes?: string[];
      deliveryProvider?: 'platform' | 'self';
      allowCrossCommunity?: boolean;
      businessType?: string;
      mealCategories?: string[];
      storeNotice?: string | null;
      scheduleMode?: string;
      operatingHours?: unknown;
      availabilityOverride?: string | null;
      availabilityOverrideUntil?: string | null;
      availabilityNote?: string | null;
      orderCutoffTime?: string | null;
      maxDailyOrders?: number | null;
      minPrepTimeMinutes?: number | null;
      preOrderOnly?: boolean;
      advanceBookingMinDays?: number | null;
      advanceBookingMaxDays?: number | null;
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
    if (data.jazzcashAccountTitle !== undefined) updateData.jazzcashAccountTitle = data.jazzcashAccountTitle || null;
    if (data.easypaisaNumber !== undefined) updateData.easypaisaNumber = data.easypaisaNumber || null;
    if (data.easypaisaAccountTitle !== undefined) updateData.easypaisaAccountTitle = data.easypaisaAccountTitle || null;
    if (data.bankAccountName !== undefined) updateData.bankAccountName = data.bankAccountName || null;
    if (data.bankAccountNumber !== undefined) updateData.bankAccountNumber = data.bankAccountNumber || null;
    if (data.bankName !== undefined) updateData.bankName = data.bankName || null;
    if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold;
    if (data.enableStockAlerts !== undefined) updateData.enableStockAlerts = data.enableStockAlerts;
    if (data.freeDeliveryAreas !== undefined) updateData.freeDeliveryAreas = data.freeDeliveryAreas;
    if (data.freeDeliveryRadiusKm !== undefined) updateData.freeDeliveryRadiusKm = data.freeDeliveryRadiusKm;
    if (data.latitude !== undefined) updateData.latitude = data.latitude;
    if (data.longitude !== undefined) updateData.longitude = data.longitude;
    if (data.deliveryFeeType !== undefined) updateData.deliveryFeeType = data.deliveryFeeType === '' ? null : data.deliveryFeeType;
    if (data.deliveryFeeFixed !== undefined) updateData.deliveryFeeFixed = data.deliveryFeeFixed;
    if (data.deliveryFeeBase !== undefined) updateData.deliveryFeeBase = data.deliveryFeeBase;
    if (data.deliveryFeePerKm !== undefined) updateData.deliveryFeePerKm = data.deliveryFeePerKm;
    if (data.distancePricingTiers !== undefined) updateData.distancePricingTiers = data.distancePricingTiers;
    if (data.maxDeliveryDistanceKm !== undefined) updateData.maxDeliveryDistanceKm = data.maxDeliveryDistanceKm;
    if (data.minOrderAmountForDelivery !== undefined) updateData.minOrderAmountForDelivery = data.minOrderAmountForDelivery;
    if (data.freeDeliveryThreshold !== undefined) updateData.freeDeliveryThreshold = data.freeDeliveryThreshold;
    if (data.allowedPostalCodes !== undefined) updateData.allowedPostalCodes = data.allowedPostalCodes;
    if (data.deliveryZones !== undefined) updateData.deliveryZones = data.deliveryZones;
    if (data.deliveryModes !== undefined) updateData.deliveryModes = data.deliveryModes;
    if (data.deliveryProvider !== undefined) updateData.deliveryProvider = data.deliveryProvider;
    if (data.allowCrossCommunity !== undefined) updateData.allowCrossCommunity = data.allowCrossCommunity;
    if (data.businessType !== undefined) updateData.businessType = data.businessType;
    if (data.mealCategories !== undefined) updateData.mealCategories = data.mealCategories;
    if (data.storeNotice !== undefined) updateData.storeNotice = data.storeNotice;
    if (data.scheduleMode !== undefined) updateData.scheduleMode = data.scheduleMode;
    if (data.operatingHours !== undefined) updateData.operatingHours = data.operatingHours;
    if (data.availabilityOverride !== undefined) updateData.availabilityOverride = data.availabilityOverride;
    if (data.availabilityOverrideUntil !== undefined) {
      updateData.availabilityOverrideUntil = data.availabilityOverrideUntil ? new Date(data.availabilityOverrideUntil) : null;
    }
    if (data.availabilityNote !== undefined) updateData.availabilityNote = data.availabilityNote;
    if (data.orderCutoffTime !== undefined) updateData.orderCutoffTime = data.orderCutoffTime;
    if (data.maxDailyOrders !== undefined) updateData.maxDailyOrders = data.maxDailyOrders;
    if (data.minPrepTimeMinutes !== undefined) updateData.minPrepTimeMinutes = data.minPrepTimeMinutes;
    if (data.preOrderOnly !== undefined) updateData.preOrderOnly = data.preOrderOnly;
    if (data.advanceBookingMinDays !== undefined) updateData.advanceBookingMinDays = data.advanceBookingMinDays;
    if (data.advanceBookingMaxDays !== undefined) updateData.advanceBookingMaxDays = data.advanceBookingMaxDays;

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
      deliveryProvider: updated.deliveryProvider,
      allowCrossCommunity: updated.allowCrossCommunity,
      updatedAt: updated.updatedAt,
      ...formatBusinessOperationsFields(updated),
    };
  }

  /**
   * The seller's delivery terms per community: every active community, with the
   * fee the seller has fixed for it (if any), plus their delivery provider.
   */
  async getCommunityDelivery(userId: string) {
    const seller = await prisma.seller.findUnique({
      where: { userId },
      include: {
        community: { select: { id: true, name: true, slug: true, city: true, neighborCommunityIds: true } },
        communityDeliveries: true,
      },
    });
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const communities = await prisma.community.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, city: true, deliveryBaseFee: true, crossCommunityBaseFee: true },
    });
    const ruleById = new Map(seller.communityDeliveries.map((r) => [r.communityId, r]));
    const neighborIds = new Set(seller.community?.neighborCommunityIds ?? []);
    const pricing = await getPlatformDeliveryPricing();

    return {
      deliveryProvider: seller.deliveryProvider,
      allowCrossCommunity: seller.allowCrossCommunity,
      homeCommunity: seller.community ? { id: seller.community.id, name: seller.community.name } : null,
      // true once the seller has fixed terms for any community; from then on a
      // community without an enabled row is not deliverable.
      configured: seller.communityDeliveries.length > 0,
      communities: communities.map((c) => {
        const rule = ruleById.get(c.id);
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          city: c.city,
          isHome: c.id === seller.communityId,
          isNeighbor: neighborIds.has(c.id),
          suggestedFee: Number(c.id === seller.communityId ? c.deliveryBaseFee : c.crossCommunityBaseFee),
          // What a customer there pays when a Nuray rider delivers (community centre to centre;
          // the real fee uses the exact addresses). null: too far for Nuray riders.
          ...(() => {
            const r = platformDeliveryFee(seller.communityId, { communityId: c.id }, null, pricing);
            // fixed: the community's own fee or an admin's pair price; distance: estimated by distance
            return { nurayFee: r.deliverable ? r.fee : null, nurayFeeIsFixed: r.pricing === 'same_community' || r.pricing === 'community_pair' };
          })(),
          terms: rule
            ? {
                fee: Number(rule.fee),
                freeAbove: rule.freeAbove != null ? Number(rule.freeAbove) : null,
                minOrderAmount: rule.minOrderAmount != null ? Number(rule.minOrderAmount) : null,
                isEnabled: rule.isEnabled,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Replace the seller's per-community delivery terms. An empty list clears them
   * (the seller falls back to their seller-wide delivery policy).
   */
  async setCommunityDelivery(
    userId: string,
    terms: Array<{
      communityId: string;
      fee: number;
      freeAbove?: number | null;
      minOrderAmount?: number | null;
      isEnabled?: boolean;
    }>
  ) {
    const seller = await prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const ids = terms.map((t) => t.communityId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError('Each community can only be listed once', 400, 'DUPLICATE_COMMUNITY');
    }

    if (terms.length > 0) {
      const found = await prisma.community.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw new AppError('One or more communities were not found', 400, 'COMMUNITY_NOT_FOUND');
      }
      // The home community must always have terms: otherwise a seller could fix
      // fees for neighbours and silently stop delivering to their own street.
      if (seller.communityId && !ids.includes(seller.communityId)) {
        throw new AppError(
          'Set delivery terms for your own community before others',
          400,
          'HOME_COMMUNITY_REQUIRED'
        );
      }
      if (!seller.allowCrossCommunity && ids.some((id) => id !== seller.communityId)) {
        throw new AppError(
          'Enable cross-community delivery before setting fees for other communities',
          400,
          'CROSS_COMMUNITY_DISABLED'
        );
      }
    }

    await prisma.$transaction([
      prisma.sellerCommunityDelivery.deleteMany({
        where: { sellerId: seller.id, communityId: { notIn: ids } },
      }),
      ...terms.map((t) =>
        prisma.sellerCommunityDelivery.upsert({
          where: { sellerId_communityId: { sellerId: seller.id, communityId: t.communityId } },
          create: {
            sellerId: seller.id,
            communityId: t.communityId,
            fee: t.fee,
            freeAbove: t.freeAbove ?? null,
            minOrderAmount: t.minOrderAmount ?? null,
            isEnabled: t.isEnabled ?? true,
          },
          update: {
            fee: t.fee,
            freeAbove: t.freeAbove ?? null,
            minOrderAmount: t.minOrderAmount ?? null,
            isEnabled: t.isEnabled ?? true,
          },
        })
      ),
    ]);

    return this.getCommunityDelivery(userId);
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
            id: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            deliveryFeeBreakdown: true,
            createdAt: true,
          },
        },
      },
    });

    // "Active" means still in progress toward delivery — a cancelled or
    // refunded/refund_pending order isn't going anywhere, so it's excluded
    // from both active and pending.
    const TERMINAL_STATUSES = ['delivered', 'completed', 'cancelled', 'refunded', 'refund_pending'];
    const activeOrders = orderItems.filter(
      (item) => !TERMINAL_STATUSES.includes(item.order.orderStatus)
    ).length;

    const pendingOrders = orderItems.filter(
      (item) => item.order.orderStatus === 'pending' || item.order.orderStatus === 'preparing'
    ).length;

    // Earnings require BOTH the order having actually arrived (delivered/completed)
    // AND the payment having actually been collected — a delivered order whose
    // online payment never completed (or was refunded after delivery) hasn't
    // actually earned the seller anything yet.
    // Cancelled items (a seller's rejected lines, refunded to the customer) never count:
    // an order can still be delivered by the other sellers in it.
    const completedItems = orderItems.filter(
      (item) =>
        item.status !== 'cancelled' &&
        (item.order.orderStatus === 'delivered' || item.order.orderStatus === 'completed') &&
        item.order.paymentStatus === 'paid'
    );

    // Balance from who actually holds each order's money (see seller-balance.service.ts).
    const balance = await computeSellerBalance(prisma, sellerId);
    const totalEarnings = balance.totalEarnings;
    const pendingPayout = balance.pendingPayout;
    // Kept under its old name for the dashboard: what the seller owes the platform on money
    // they collected themselves (COD at their own door, transfers into their own account).
    const codCommissionOwed = Math.max(0, balance.sellerOwesPlatform);
    const availableForPayout = balance.available;

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

    // Today's stats
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayItems = orderItems.filter(
      (item) => new Date(item.order.createdAt) >= startOfToday
    );
    const todayOrders = new Set(todayItems.map((i) => i.order.id)).size;
    const todaySales = todayItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    // Lifetime Gross & Commission
    const grossSales = completedItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const platformFees = completedItems.reduce((sum, item) => sum + Number(item.commissionAmount), 0);

    const paidSettlement = balance.paidOut;

    const availability = computeSellerAvailability(seller);

    return {
      // Seller profile information
      id: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      businessType: seller.businessType,
      primaryCommunityName: seller.primaryCommunityName,
      description: seller.description,
      kitchenVideoUrl: seller.kitchenVideoUrl,
      coverImageUrl: seller.coverImageUrl,
      verificationStatus: seller.verificationStatus,
      rejectionReason: seller.rejectionReason,
      status: seller.status,
      isVerified: seller.isVerified,
      availabilityOverride: seller.availabilityOverride,
      isStoreOpen: availability.isOpen,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      // Dashboard analytics
      overview: {
        totalProducts: seller.products.length,
        activeOrders,
        pendingOrders,
        totalEarnings,
        pendingPayout,
        codCommissionOwed,
        owedToPlatform: codCommissionOwed,
        availableForPayout: Math.max(0, availableForPayout),
        // Your share of cash orders whose cash a Nuray rider has not handed in yet.
        awaitingRiderCash: balance.awaitingRiderCash,
        rating: Number(seller.ratingAverage),
        totalReviews: seller.totalReviews,
        todaySales,
        todayOrders,
        grossSales,
        platformFees,
        netEarnings: totalEarnings,
        pendingSettlement: pendingPayout,
        paidSettlement,
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
      (item) =>
        item.status !== 'cancelled' &&
        (item.order?.orderStatus === 'delivered' || item.order?.orderStatus === 'completed')
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

    // Compute the balance and create the payout under a row lock on the seller:
    // two simultaneous requests used to both read the same balance and together
    // withdraw more than the seller had earned.
    const payout = await prisma.$transaction(async (tx) => {
      // FOR NO KEY UPDATE, not FOR UPDATE: it still serialises payout requests for this
      // seller, but doesn't block the KEY SHARE lock every new order item / cart item
      // takes on its seller row, so the kitchen keeps taking orders meanwhile.
      await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${sellerId} FOR NO KEY UPDATE`;

      // From who actually holds each order's money (seller-balance.service.ts): money the
      // platform collected, minus what the seller owes on money they collected themselves
      // (COD at their door, transfers into their own account), minus payouts completed or
      // already requested (so back-to-back requests can't withdraw the same money twice).
      const balance = await computeSellerBalance(tx, sellerId);
      if (data.amount > balance.available) {
        throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
      }

      // No further commission here: order_items.seller_payout is already net of the
      // seller's commission_rate at order time (see order.service.ts createOrder),
      // so the requested amount is what the seller actually receives.
      const commissionDeducted = 0;
      const netAmount = data.amount;

      // Create payout request
      return tx.sellerPayout.create({
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

  /**
   * 1-Click Toggle Store Open / Closed Status
   */
  async toggleStoreStatus(sellerId: string) {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const currentAvailability = computeSellerAvailability(seller);
    const nextOverride = currentAvailability.isOpen ? 'closed' : 'open';

    const updated = await prisma.seller.update({
      where: { id: sellerId },
      data: {
        availabilityOverride: nextOverride,
        availabilityOverrideUntil: null,
      },
    });

    const newAvailability = computeSellerAvailability(updated);

    return {
      availabilityOverride: updated.availabilityOverride,
      isOpen: newAvailability.isOpen,
      message: newAvailability.isOpen ? 'Store is now OPEN and accepting orders' : 'Store is now CLOSED',
    };
  }
}

export default new SellerService();

