import { Request, Response } from 'express';
import sellerService from '../services/seller.service';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';
import { computeSellerAvailability } from '../services/availability.service';

export const getCurrentSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await sellerService.getSellerProfile(req.user.userId);

  res.status(200).json({
    success: true,
    data: profile,
  });
};

export const updateCurrentSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await sellerService.updateSellerProfile(req.user.userId, req.body);

  res.status(200).json({
    success: true,
    data: profile,
    message: 'Seller profile updated successfully',
  });
};

export const getCommunityDelivery = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = await sellerService.getCommunityDelivery(req.user.userId);

  res.status(200).json({ success: true, data });
};

export const setCommunityDelivery = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = await sellerService.setCommunityDelivery(req.user.userId, req.body.terms);

  res.status(200).json({
    success: true,
    data,
    message: 'Community delivery terms saved',
  });
};

export const registerAsSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true, verificationStatus: true },
  });

  if (seller && seller.verificationStatus !== 'rejected') {
    throw new AppError('Seller account already exists', 400, 'SELLER_ALREADY_EXISTS');
  }

  const result = await sellerService.registerAsSeller(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Application submitted for review',
  });
};

export const getSellerDashboard = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const dashboard = await sellerService.getSellerDashboard(seller.id);

  res.status(200).json({
    success: true,
    data: dashboard,
  });
};

export const getSellerAnalytics = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const period = (req.query.period as string) || '30d';
  const analytics = await sellerService.getSellerAnalytics(seller.id, period);

  res.status(200).json({
    success: true,
    data: analytics,
  });
};

export const requestPayout = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const result = await sellerService.requestPayout(seller.id, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Payout request submitted successfully',
  });
};

export const getPayoutHistory = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const payouts = await sellerService.getPayoutHistory(seller.id);

  res.status(200).json({
    success: true,
    data: payouts,
  });
};

export const toggleStoreLive = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const result = await sellerService.toggleStoreStatus(seller.id);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getPublicSellers = async (req: Request, res: Response) => {
  const { communityId, city, businessType, search, limit } = req.query;

  const whereClause: any = {
    isVerified: true,
    status: 'active',
    verificationStatus: 'approved',
  };

  if (communityId && typeof communityId === 'string') {
    whereClause.communityId = communityId;
  }

  if (city && typeof city === 'string') {
    whereClause.community = {
      city: {
        equals: city,
        mode: 'insensitive',
      },
    };
  }

  if (businessType && typeof businessType === 'string') {
    whereClause.businessType = businessType;
  }

  if (search && typeof search === 'string') {
    whereClause.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const sellers = await prisma.seller.findMany({
    where: whereClause,
    take: limit ? Math.min(Number(limit), 50) : 30,
    orderBy: { ratingAverage: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              area: true,
            },
          },
        },
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          deliveryBaseFee: true,
        },
      },
      products: {
        where: { isActive: true, approvalStatus: 'approved' },
        take: 4,
        select: {
          id: true,
          name: true,
          price: true,
          originalPrice: true,
          productType: true,
          preparationTime: true,
          images: {
            select: {
              imageUrl: true,
              isPrimary: true,
            },
          },
        },
      },
      _count: {
        select: {
          products: { where: { isActive: true, approvalStatus: 'approved' } },
          reviews: true,
        },
      },
    },
  });

  const formatted = sellers.map((s) => ({
    id: s.id,
    userId: s.userId,
    businessName: s.businessName,
    businessNameUrdu: s.businessNameUrdu,
    description: s.description,
    coverImageUrl: s.coverImageUrl,
    // Real rating only: 0 with no reviews (the UI shows "New"), never a made-up 4.8.
    ratingAverage: Number(s.ratingAverage) || 0,
    totalReviews: s.totalReviews || s._count.reviews || 0,
    minPrepTimeMinutes: s.minPrepTimeMinutes || 25,
    minOrderAmountForDelivery: s.minOrderAmountForDelivery != null ? Number(s.minOrderAmountForDelivery) : null,
    freeDeliveryThreshold: s.freeDeliveryThreshold != null ? Number(s.freeDeliveryThreshold) : null,
    deliveryFeeType: s.deliveryFeeType || null,
    deliveryFeeFixed: s.deliveryFeeFixed != null ? Number(s.deliveryFeeFixed) : null,
    freeDeliveryRadiusKm: s.freeDeliveryRadiusKm != null ? Number(s.freeDeliveryRadiusKm) : null,
    businessType: s.businessType,
    mealCategories: s.mealCategories,
    allowCrossCommunity: s.allowCrossCommunity,
    community: s.community,
    availability: computeSellerAvailability({
      status: s.status,
      scheduleMode: s.scheduleMode,
      operatingHours: s.operatingHours,
      availabilityOverride: s.availabilityOverride,
      availabilityOverrideUntil: s.availabilityOverrideUntil,
      availabilityNote: s.availabilityNote,
    }),
    chef: {
      name: s.user?.profile?.fullName || s.businessName,
      avatar: s.user?.profile?.avatarUrl || null,
      area: s.user?.profile?.area || s.community?.name || '',
      city: s.user?.profile?.city || s.community?.city || '',
    },
    products: s.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      productType: p.productType,
      images: p.images.map((img) => img.imageUrl),
      preparationTime: p.preparationTime,
    })),
    productCount: s._count.products,
  }));

  res.status(200).json({
    success: true,
    data: formatted,
    count: formatted.length,
  });
};

export const getPublicSellerById = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Search by seller.id OR seller.userId
  const seller = await prisma.seller.findFirst({
    where: {
      OR: [
        { id },
        { userId: id },
      ],
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              area: true,
            },
          },
        },
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          deliveryBaseFee: true,
          crossCommunityBaseFee: true,
          areaDescription: true,
        },
      },
      products: {
        where: { isActive: true, approvalStatus: 'approved' },
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          images: {
            select: {
              imageUrl: true,
              isPrimary: true,
            },
          },
        },
      },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              profile: {
                select: {
                  fullName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!seller) {
    throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
  }

  const availability = computeSellerAvailability({
    status: seller.status,
    scheduleMode: seller.scheduleMode,
    operatingHours: seller.operatingHours,
    availabilityOverride: seller.availabilityOverride,
    availabilityOverrideUntil: seller.availabilityOverrideUntil,
    availabilityNote: seller.availabilityNote,
  });

  const result = {
    id: seller.id,
    userId: seller.userId,
    businessName: seller.businessName,
    businessNameUrdu: seller.businessNameUrdu,
    description: seller.description,
    coverImageUrl: seller.coverImageUrl,
    ratingAverage: Number(seller.ratingAverage) || 0,
    totalReviews: seller.totalReviews || seller.reviews.length || 0,
    minPrepTimeMinutes: seller.minPrepTimeMinutes || 25,
    minOrderAmountForDelivery: seller.minOrderAmountForDelivery != null ? Number(seller.minOrderAmountForDelivery) : null,
    freeDeliveryThreshold: seller.freeDeliveryThreshold != null ? Number(seller.freeDeliveryThreshold) : null,
    deliveryFeeType: seller.deliveryFeeType || null,
    deliveryFeeFixed: seller.deliveryFeeFixed != null ? Number(seller.deliveryFeeFixed) : null,
    deliveryFeeBase: seller.deliveryFeeBase != null ? Number(seller.deliveryFeeBase) : null,
    deliveryFeePerKm: seller.deliveryFeePerKm != null ? Number(seller.deliveryFeePerKm) : null,
    freeDeliveryRadiusKm: seller.freeDeliveryRadiusKm != null ? Number(seller.freeDeliveryRadiusKm) : null,
    freeDeliveryAreas: seller.freeDeliveryAreas || [],
    scheduleMode: seller.scheduleMode,
    operatingHours: seller.operatingHours,
    orderCutoffTime: seller.orderCutoffTime,
    preOrderOnly: seller.preOrderOnly,
    storeNotice: seller.storeNotice,
    businessType: seller.businessType,
    mealCategories: seller.mealCategories,
    allowCrossCommunity: seller.allowCrossCommunity,
    isVerified: seller.isVerified,
    verificationStatus: seller.verificationStatus,
    availability,
    community: seller.community,
    chef: {
      name: seller.user?.profile?.fullName || seller.businessName,
      avatar: seller.user?.profile?.avatarUrl || null,
      bio: seller.description,
      area: seller.user?.profile?.area || seller.community?.name || '',
      city: seller.user?.profile?.city || seller.community?.city || '',
    },
    products: seller.products.map((p) => ({
      id: p.id,
      name: p.name,
      nameUrdu: p.nameUrdu,
      description: p.description,
      price: Number(p.price),
      originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
      productType: p.productType,
      images: p.images.map((img) => img.imageUrl),
      preparationTime: p.preparationTime,
      storageDays: p.storageDays,
      heatingInstructions: p.heatingInstructions,
      ingredients: p.ingredients,
      allergens: p.allergens,
      dietaryInfo: p.dietaryInfo,
      stockQuantity: p.stockQuantity,
      category: p.category,
    })),
    reviews: seller.reviews.map((r) => ({
      id: r.id,
      rating: r.sellerRating || r.productRating || 5,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.customer?.profile?.fullName || 'Verified Buyer',
      avatar: r.customer?.profile?.avatarUrl || null,
    })),
  };

  res.status(200).json({
    success: true,
    data: result,
  });
};


