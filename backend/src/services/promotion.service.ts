import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class PromotionService {
  /**
   * Validate promotion code
   */
  async validatePromotionCode(userId: string, code: string, cartTotal: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!promotion) {
      throw new AppError('Invalid promotion code', 400, 'INVALID_PROMO_CODE');
    }

    if (!promotion.isActive) {
      throw new AppError('Promotion code is not active', 400, 'PROMO_INACTIVE');
    }

    const now = new Date();
    if (now < promotion.validFrom || now > promotion.validUntil) {
      throw new AppError('Promotion code has expired', 400, 'PROMO_EXPIRED');
    }

    if (cartTotal < Number(promotion.minOrderAmount)) {
      throw new AppError(
        `Minimum order amount is ${promotion.minOrderAmount}`,
        400,
        'MIN_ORDER_NOT_MET'
      );
    }

    // Check usage limits
    if (promotion.usageLimitTotal && promotion.usedCount >= promotion.usageLimitTotal) {
      throw new AppError('Promotion code usage limit reached', 400, 'PROMO_LIMIT_REACHED');
    }

    // Check per-user usage limit
    const userUsage = await prisma.promotionUsage.count({
      where: {
        promotionId: promotion.id,
        userId,
      },
    });

    if (userUsage >= promotion.usageLimitPerUser) {
      throw new AppError('You have already used this promotion code', 400, 'PROMO_ALREADY_USED');
    }

    // Calculate discount
    let discountAmount = 0;
    if (promotion.discountType === 'percentage') {
      discountAmount = (cartTotal * Number(promotion.discountValue)) / 100;
      if (promotion.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, Number(promotion.maxDiscountAmount));
      }
    } else {
      discountAmount = Number(promotion.discountValue);
    }

    const finalAmount = cartTotal - discountAmount;

    return {
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: Number(promotion.discountValue),
      discountAmount,
      finalAmount,
      isValid: true,
      maxDiscountAmount: promotion.maxDiscountAmount
        ? Number(promotion.maxDiscountAmount)
        : null,
    };
  }

  /**
   * Get available promotions
   */
  async getAvailablePromotions(userId: string) {
    const now = new Date();

    const allPromotions = await prisma.promotion.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      orderBy: { discountValue: 'desc' },
    });

    // Filter promotions that haven't exceeded usage limit
    const availablePromotions = allPromotions.filter((promo) => {
      if (promo.usageLimitTotal === null) return true;
      return promo.usedCount < promo.usageLimitTotal;
    });

    // Filter promotions user hasn't exceeded usage limit for
    const userAvailablePromotions = [];
    for (const promo of availablePromotions) {
      const userUsage = await prisma.promotionUsage.count({
        where: {
          promotionId: promo.id,
          userId,
        },
      });

      if (userUsage < promo.usageLimitPerUser) {
        userAvailablePromotions.push({
          code: promo.code,
          name: promo.name,
          description: promo.description,
          discountType: promo.discountType,
          discountValue: Number(promo.discountValue),
          maxDiscountAmount: promo.maxDiscountAmount ? Number(promo.maxDiscountAmount) : null,
          minOrderAmount: Number(promo.minOrderAmount),
          validUntil: promo.validUntil,
        });
      }
    }

    return userAvailablePromotions;
  }

  /**
   * Create a promotion for a seller
   */
  async createForSeller(
    sellerId: string,
    data: {
      name: string;
      code: string;
      description?: string;
      discountType: 'percentage' | 'fixed';
      discountValue: number;
      maxDiscountAmount?: number | null;
      minOrderAmount: number;
      usageLimitTotal?: number | null;
      usageLimitPerUser: number;
      validFrom: Date;
      validUntil: Date;
      applyTo?: 'all' | 'selected';
      productIds?: string[];
    }
  ) {
    const code = data.code.toUpperCase().replace(/\s/g, '');
    const existing = await prisma.promotion.findUnique({ where: { code } });
    if (existing) {
      throw new AppError('This promo code is already in use. Please choose another.', 400, 'CODE_TAKEN');
    }

    const applyTo = data.applyTo === 'selected' && data.productIds?.length ? 'selected' : 'all';
    let applicableProductIds: string[] = [];
    if (applyTo === 'selected' && data.productIds?.length) {
      const sellerProducts = await prisma.product.findMany({
        where: { sellerId, id: { in: data.productIds } },
        select: { id: true },
      });
      const validIds = sellerProducts.map((p) => p.id);
      const invalid = data.productIds.filter((id) => !validIds.includes(id));
      if (invalid.length > 0) {
        throw new AppError('Some selected products do not belong to you or were not found.', 400, 'INVALID_PRODUCTS');
      }
      applicableProductIds = validIds;
    }

    const promotion = await prisma.promotion.create({
      data: {
        sellerId,
        code,
        name: data.name,
        description: data.description ?? null,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxDiscountAmount: data.maxDiscountAmount ?? null,
        minOrderAmount: data.minOrderAmount,
        applicableTo: applyTo,
        applicableProductIds,
        applicableCities: [],
        usageLimitTotal: data.usageLimitTotal ?? null,
        usageLimitPerUser: data.usageLimitPerUser,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: true,
      },
    });

    return {
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      description: promotion.description,
      discountType: promotion.discountType,
      discountValue: Number(promotion.discountValue),
      maxDiscountAmount: promotion.maxDiscountAmount ? Number(promotion.maxDiscountAmount) : null,
      minOrderAmount: Number(promotion.minOrderAmount),
      applicableTo: promotion.applicableTo,
      applicableProductIds: promotion.applicableProductIds ?? [],
      usageLimitTotal: promotion.usageLimitTotal,
      usageLimitPerUser: promotion.usageLimitPerUser,
      usedCount: promotion.usedCount,
      validFrom: promotion.validFrom,
      validUntil: promotion.validUntil,
      isActive: promotion.isActive,
      createdAt: promotion.createdAt,
    };
  }

  /**
   * Get active promotions that apply to each product (for customer catalog).
   * Returns { [productId]: [ { id, name, type, discountValue, ... } ] }
   */
  async getPromotionsForCatalog(productIds: string[]): Promise<Record<string, Array<{
    id: string;
    name: string;
    type: string;
    discountValue: number;
  }>>> {
    if (!productIds?.length) return {};

    const now = new Date();
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sellerId: true },
    });
    const sellerIds = [...new Set(products.map((p) => p.sellerId))];

    const promotions = await prisma.promotion.findMany({
      where: {
        sellerId: { in: sellerIds },
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      select: {
        id: true,
        name: true,
        discountType: true,
        discountValue: true,
        applicableTo: true,
        applicableProductIds: true,
        sellerId: true,
      },
    });

    const result: Record<string, Array<{ id: string; name: string; type: string; discountValue: number }>> = {};
    for (const product of products) {
      const applicable = promotions.filter((p) => {
        if (p.sellerId !== product.sellerId) return false;
        const appliesToAll = p.applicableTo == null || String(p.applicableTo).toLowerCase() === 'all';
        const ids = (p.applicableProductIds ?? []) as string[];
        return appliesToAll || ids.includes(product.id);
      });
      if (applicable.length) {
        result[product.id] = applicable.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.discountType,
          discountValue: Number(p.discountValue),
        }));
      }
    }
    return result;
  }

  /**
   * List promotions for a seller
   */
  async listBySeller(sellerId: string) {
    const list = await prisma.promotion.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return list.map((p) => {
      let status: 'active' | 'scheduled' | 'expired' | 'draft' = 'draft';
      if (!p.isActive) status = 'draft';
      else if (now < p.validFrom) status = 'scheduled';
      else if (now > p.validUntil) status = 'expired';
      else status = 'active';

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        type: p.discountType,
        discountValue: Number(p.discountValue),
        startDate: p.validFrom,
        endDate: p.validUntil,
        status,
        usageCount: p.usedCount,
        usageLimitTotal: p.usageLimitTotal,
        usageLimitPerUser: p.usageLimitPerUser,
        minOrderAmount: Number(p.minOrderAmount),
        isActive: p.isActive,
        applicableTo: p.applicableTo,
        applicableProductIds: p.applicableProductIds ?? [],
        createdAt: p.createdAt,
      };
    });
  }

  /**
   * Get one promotion by id (seller only, must own it)
   */
  async getOneForSeller(sellerId: string, promotionId: string) {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion) {
      throw new AppError('Promotion not found', 404, 'PROMOTION_NOT_FOUND');
    }
    if (promotion.sellerId !== sellerId) {
      throw new AppError('You can only view your own promotions', 403, 'FORBIDDEN');
    }
    const now = new Date();
    let status: 'active' | 'scheduled' | 'expired' | 'draft' = 'draft';
    if (!promotion.isActive) status = 'draft';
    else if (now < promotion.validFrom) status = 'scheduled';
    else if (now > promotion.validUntil) status = 'expired';
    else status = 'active';
    return {
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      description: promotion.description,
      type: promotion.discountType,
      discountValue: Number(promotion.discountValue),
      startDate: promotion.validFrom,
      endDate: promotion.validUntil,
      status,
      usageCount: promotion.usedCount,
      usageLimitTotal: promotion.usageLimitTotal,
      usageLimitPerUser: promotion.usageLimitPerUser,
      minOrderAmount: Number(promotion.minOrderAmount),
      applicableTo: promotion.applicableTo,
      applicableProductIds: promotion.applicableProductIds ?? [],
      isActive: promotion.isActive,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    };
  }

  /**
   * Update a promotion (seller only, must own it)
   */
  async updateForSeller(
    sellerId: string,
    promotionId: string,
    data: {
      name?: string;
      code?: string;
      description?: string | null;
      discountType?: 'percentage' | 'fixed';
      discountValue?: number;
      maxDiscountAmount?: number | null;
      minOrderAmount?: number;
      usageLimitTotal?: number | null;
      usageLimitPerUser?: number;
      validFrom?: Date;
      validUntil?: Date;
      applyTo?: 'all' | 'selected';
      productIds?: string[];
    }
  ) {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion) {
      throw new AppError('Promotion not found', 404, 'PROMOTION_NOT_FOUND');
    }
    if (promotion.sellerId !== sellerId) {
      throw new AppError('You can only update your own promotions', 403, 'FORBIDDEN');
    }
    if (data.code != null) {
      const code = data.code.toUpperCase().replace(/\s/g, '');
      const existing = await prisma.promotion.findFirst({
        where: { code, id: { not: promotionId } },
      });
      if (existing) {
        throw new AppError('This promo code is already in use. Please choose another.', 400, 'CODE_TAKEN');
      }
    }
    let applicableProductIds: string[] | undefined;
    if (data.applyTo === 'selected' && data.productIds?.length) {
      const sellerProducts = await prisma.product.findMany({
        where: { sellerId, id: { in: data.productIds } },
        select: { id: true },
      });
      applicableProductIds = sellerProducts.map((p) => p.id);
    } else if (data.applyTo === 'all' || !data.applyTo) {
      applicableProductIds = [];
    }
    const updated = await prisma.promotion.update({
      where: { id: promotionId },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.code != null && { code: data.code.toUpperCase().replace(/\s/g, '') }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.discountType != null && { discountType: data.discountType }),
        ...(data.discountValue != null && { discountValue: data.discountValue }),
        ...(data.maxDiscountAmount !== undefined && { maxDiscountAmount: data.maxDiscountAmount }),
        ...(data.minOrderAmount != null && { minOrderAmount: data.minOrderAmount }),
        ...(data.usageLimitTotal !== undefined && { usageLimitTotal: data.usageLimitTotal }),
        ...(data.usageLimitPerUser != null && { usageLimitPerUser: data.usageLimitPerUser }),
        ...(data.validFrom != null && { validFrom: data.validFrom }),
        ...(data.validUntil != null && { validUntil: data.validUntil }),
        ...(data.applyTo != null && { applicableTo: data.applyTo }),
        ...(applicableProductIds !== undefined && { applicableProductIds }),
      },
    });
    return this.getOneForSeller(sellerId, updated.id);
  }

  /**
   * Delete a promotion (only if owned by seller)
   */
  async deleteForSeller(sellerId: string, promotionId: string) {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion) {
      throw new AppError('Promotion not found', 404, 'PROMOTION_NOT_FOUND');
    }
    if (promotion.sellerId !== sellerId) {
      throw new AppError('You can only delete your own promotions', 403, 'FORBIDDEN');
    }
    await prisma.promotion.delete({ where: { id: promotionId } });
    return { success: true };
  }
}

export default new PromotionService();

