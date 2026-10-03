import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

/**
 * Stack multiple catalog discounts onto a base price, percentage discounts
 * first then fixed amounts — must stay byte-for-byte identical to the
 * frontend's getStackedDiscountedPrice (checkout/cart/product pages) so the
 * price a customer sees always matches what they're actually charged.
 */
export function applyStackedDiscount(
  basePrice: number,
  promos: Array<{ discountType: string; discountValue: number }>
): number {
  if (!promos?.length) return basePrice;
  const sorted = [...promos].sort((a, b) =>
    a.discountType === 'percentage' && b.discountType === 'fixed'
      ? -1
      : a.discountType === 'fixed' && b.discountType === 'percentage'
        ? 1
        : 0
  );
  const result = sorted.reduce((price, p) => {
    if (p.discountType === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.discountType === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, basePrice);
  return Math.round(result);
}

type CatalogEligiblePromotion = {
  id: string;
  sellerId: string | null;
  discountType: string;
  discountValue: unknown;
  applicableTo: string;
  applicableProductIds: string[];
  usageLimitTotal: number | null;
  usedCount: number;
  usageLimitPerUser: number;
};

export interface PromotionScopeItem {
  productId: string | null;
  sellerId: string;
  total: number;
}

/**
 * The part of an order a manually-entered promotion code may discount. A
 * seller's code only covers that seller's items, and a code limited to specific
 * products only covers those; everything else is untouched. Without this, a
 * code issued by one seller discounted the whole cart, including other sellers'
 * items (the platform/other seller silently funds it).
 */
export function isItemEligibleForPromotion(
  promotion: { sellerId: string | null; applicableProductIds: string[] },
  item: PromotionScopeItem
): boolean {
  if (promotion.sellerId && item.sellerId !== promotion.sellerId) return false;
  return (
    promotion.applicableProductIds.length === 0 ||
    (item.productId != null && promotion.applicableProductIds.includes(item.productId))
  );
}

export function eligibleSubtotalForPromotion(
  promotion: { sellerId: string | null; applicableProductIds: string[] },
  items: PromotionScopeItem[]
): number {
  return items.filter((i) => isItemEligibleForPromotion(promotion, i)).reduce((sum, i) => sum + i.total, 0);
}

/**
 * Give back the usage a cancelled order consumed, so a cancelled order doesn't
 * burn a customer's per-user limit or a code's total quota. Call inside the
 * cancel transaction.
 */
export async function releasePromotionUsage(
  tx: {
    promotionUsage: {
      findMany: (a: any) => Promise<Array<{ id: string; promotionId: string }>>;
      deleteMany: (a: any) => Promise<unknown>;
    };
    promotion: { updateMany: (a: any) => Promise<unknown> };
  },
  orderId: string
) {
  const usages = await tx.promotionUsage.findMany({ where: { orderId } });
  if (usages.length === 0) return;
  await tx.promotionUsage.deleteMany({ where: { orderId } });
  const perPromotion = new Map<string, number>();
  for (const u of usages) perPromotion.set(u.promotionId, (perPromotion.get(u.promotionId) ?? 0) + 1);
  for (const [promotionId, n] of perPromotion) {
    await tx.promotion.updateMany({
      where: { id: promotionId, usedCount: { gte: n } },
      data: { usedCount: { decrement: n } },
    });
  }
}

export class PromotionService {
  /** Is this promotion in scope for the product at all (seller + product-scope match)? */
  private isInPromotionScope(
    promotion: { sellerId: string | null; applicableTo: string; applicableProductIds: string[] },
    productId: string,
    sellerId: string
  ): boolean {
    if (promotion.sellerId !== sellerId) return false;
    const appliesToAll = promotion.applicableTo == null || String(promotion.applicableTo).toLowerCase() === 'all';
    const ids = promotion.applicableProductIds ?? [];
    return appliesToAll || ids.includes(productId);
  }

  /**
   * Is this promotion actually usable right now for a real charge — in scope
   * AND under both its total and per-user usage caps? (The public catalog
   * preview below deliberately skips usage caps since it has no per-user
   * context; charging must not.)
   */
  private isCatalogEligibleForCharge(
    promotion: CatalogEligiblePromotion,
    productId: string,
    sellerId: string,
    userUsageCount: Map<string, number>
  ): boolean {
    if (!this.isInPromotionScope(promotion, productId, sellerId)) return false;
    if (promotion.usageLimitTotal != null && promotion.usedCount >= promotion.usageLimitTotal) return false;
    if ((userUsageCount.get(promotion.id) ?? 0) >= promotion.usageLimitPerUser) return false;
    return true;
  }

  /**
   * Compute the real, charge-time catalog/deal discount for each order item —
   * the server-side twin of the frontend's catalog-promotion preview. Must be
   * called (and its unitPrices used) for every order so the amount charged
   * always matches what the customer saw on the product/cart/checkout pages.
   */
  async computeOrderCatalogDiscounts(
    customerId: string,
    items: Array<{ productId: string; sellerId: string; unitPrice: number; quantity: number }>
  ): Promise<{
    discountedUnitPrices: number[];
    usagesToRecord: Array<{ promotionId: string; discountApplied: number }>;
  }> {
    if (!items.length) return { discountedUnitPrices: [], usagesToRecord: [] };

    const now = new Date();
    const sellerIds = [...new Set(items.map((i) => i.sellerId))];
    const promotions = await prisma.promotion.findMany({
      where: { sellerId: { in: sellerIds }, isActive: true, validFrom: { lte: now }, validUntil: { gte: now } },
    });
    if (!promotions.length) {
      return { discountedUnitPrices: items.map((i) => i.unitPrice), usagesToRecord: [] };
    }

    const promotionIds = promotions.map((p) => p.id);
    const userUsageRows = await prisma.promotionUsage.groupBy({
      by: ['promotionId'],
      where: { promotionId: { in: promotionIds }, userId: customerId },
      _count: { _all: true },
    });
    const userUsageCount = new Map(userUsageRows.map((r) => [r.promotionId, r._count._all]));

    const discountByPromotion = new Map<string, number>();
    const discountedUnitPrices: number[] = [];

    for (const item of items) {
      const eligible = promotions.filter((p) =>
        this.isCatalogEligibleForCharge(p, item.productId, item.sellerId, userUsageCount)
      );
      if (!eligible.length) {
        discountedUnitPrices.push(item.unitPrice);
        continue;
      }
      const finalUnitPrice = applyStackedDiscount(
        item.unitPrice,
        eligible.map((p) => ({ discountType: p.discountType, discountValue: Number(p.discountValue) }))
      );
      discountedUnitPrices.push(finalUnitPrice);

      const itemDiscountTotal = (item.unitPrice - finalUnitPrice) * item.quantity;
      if (itemDiscountTotal > 0) {
        // Two simultaneous seller-wide promos stacking on the same product is a rare
        // edge case; attribute the full item discount to each touching promotion rather
        // than splitting it exactly. What the customer is charged is unaffected either
        // way — this only shades the per-promotion "discountApplied" ledger value.
        for (const p of eligible) {
          discountByPromotion.set(p.id, (discountByPromotion.get(p.id) ?? 0) + itemDiscountTotal);
        }
      }
    }

    const usagesToRecord = [...discountByPromotion.entries()].map(([promotionId, discountApplied]) => ({
      promotionId,
      discountApplied,
    }));

    return { discountedUnitPrices, usagesToRecord };
  }

  /**
   * Validate promotion code
   */
  async validatePromotionCode(userId: string, code: string, cartTotal: number) {
    const promotion = await prisma.promotion.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!promotion) {
      throw new AppError('Invalid promotion code', 400, 'INVALID_PROMO_CODE');
    }

    // A seller- or product-scoped code only discounts the matching part of the
    // cart. Scope it by the user's server cart when it has items.
    if (promotion.sellerId || promotion.applicableProductIds.length > 0) {
      const cartItems = await prisma.cartItem.findMany({ where: { cart: { userId } } });
      if (cartItems.length > 0) {
        const eligible = eligibleSubtotalForPromotion(
          promotion,
          cartItems.map((i) => ({
            productId: i.productId,
            sellerId: i.sellerId,
            total: Number(i.priceSnapshot) * i.quantity,
          }))
        );
        if (eligible <= 0) {
          throw new AppError(
            'This code does not apply to the items in your cart',
            400,
            'PROMO_NOT_APPLICABLE'
          );
        }
        cartTotal = Math.min(cartTotal, eligible);
      }
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
    // Never let a discount exceed the cart it applies to, regardless of the promo's configured value.
    discountAmount = Math.min(discountAmount, cartTotal);

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
    // Seller-issued codes are only offered to a customer who has that seller's
    // items in their cart, so one seller's codes can't be enumerated by everyone.
    const cartSellerIds = new Set(
      (await prisma.cartItem.findMany({ where: { cart: { userId } }, select: { sellerId: true } })).map(
        (i) => i.sellerId
      )
    );
    const availablePromotions = allPromotions.filter((promo) => {
      if (promo.sellerId && !cartSellerIds.has(promo.sellerId)) return false;
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
  async createForSeller(sellerId: string, data: Parameters<PromotionService['createPromotion']>[1]) {
    return this.createPromotion(sellerId, data);
  }

  /** A platform promo code: Nuray pays the discount, on any kitchen's order. */
  async createPlatform(data: Parameters<PromotionService['createPromotion']>[1]) {
    return this.createPromotion(null, { ...data, applyTo: 'all', productIds: [] });
  }

  private async createPromotion(
    sellerId: string | null,
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

    const applyTo = sellerId && data.applyTo === 'selected' && data.productIds?.length ? 'selected' : 'all';
    let applicableProductIds: string[] = [];
    if (sellerId && applyTo === 'selected' && data.productIds?.length) {
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

    const promotionsRaw = await prisma.promotion.findMany({
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
        usageLimitTotal: true,
        usedCount: true,
        applicableProductIds: true,
        sellerId: true,
      },
    });

    // A promo with no total-usage headroom left can't actually be charged to anyone
    // anymore — don't advertise a deal price that charge-time would reject. (Per-user
    // limits still can't be checked here: this endpoint is unauthenticated.)
    const promotions = promotionsRaw.filter(
      (p) => p.usageLimitTotal == null || p.usedCount < p.usageLimitTotal
    );

    const result: Record<string, Array<{ id: string; name: string; type: string; discountValue: number }>> = {};
    for (const product of products) {
      const applicable = promotions.filter((p) =>
        this.isInPromotionScope(p, product.id, product.sellerId)
      );
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
  async getOneForSeller(sellerId: string | null, promotionId: string) {
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
    sellerId: string | null,
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
      isActive?: boolean;
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
    // Only touch applicableProductIds when the caller actually intends to change scope
    // (i.e. applyTo was explicitly provided). Omitting applyTo on a partial edit must
    // leave the existing product association alone.
    let applicableProductIds: string[] | undefined;
    if (data.applyTo === 'selected' && sellerId) {
      if (data.productIds?.length) {
        const sellerProducts = await prisma.product.findMany({
          where: { sellerId, id: { in: data.productIds } },
          select: { id: true },
        });
        applicableProductIds = sellerProducts.map((p) => p.id);
      } else {
        applicableProductIds = [];
      }
    } else if (data.applyTo === 'all') {
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
        ...(data.isActive != null && { isActive: data.isActive }),
      },
    });
    return this.getOneForSeller(sellerId, updated.id);
  }

  /** Platform promo codes with how often they were used and how much Nuray gave away. */
  async listPlatform() {
    const list = await prisma.promotion.findMany({ where: { sellerId: null }, orderBy: { createdAt: 'desc' } });
    const usage = await prisma.promotionUsage.groupBy({
      by: ['promotionId'],
      where: { promotionId: { in: list.map((p) => p.id) } },
      _sum: { discountApplied: true },
      _count: { _all: true },
    });
    const usageById = new Map(usage.map((u) => [u.promotionId, u]));
    const now = new Date();
    return list.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      discountType: p.discountType,
      discountValue: Number(p.discountValue),
      maxDiscountAmount: p.maxDiscountAmount != null ? Number(p.maxDiscountAmount) : null,
      minOrderAmount: Number(p.minOrderAmount),
      usageLimitTotal: p.usageLimitTotal,
      usageLimitPerUser: p.usageLimitPerUser,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      isActive: p.isActive,
      status: !p.isActive ? 'off' : now < p.validFrom ? 'scheduled' : now > p.validUntil ? 'expired' : 'active',
      timesUsed: usageById.get(p.id)?._count._all ?? 0,
      discountGiven: Number(usageById.get(p.id)?._sum.discountApplied ?? 0),
      createdAt: p.createdAt,
    }));
  }

  async updatePlatform(promotionId: string, data: Parameters<PromotionService['updateForSeller']>[2]) {
    // Platform codes apply to every kitchen: no product selection.
    const { applyTo: _applyTo, productIds: _productIds, ...rest } = data;
    return this.updateForSeller(null, promotionId, rest);
  }

  /** A platform code that was never used can be deleted; a used one is switched off instead. */
  async deletePlatform(promotionId: string) {
    const promotion = await prisma.promotion.findUnique({ where: { id: promotionId }, include: { _count: { select: { usages: true } } } });
    if (!promotion || promotion.sellerId !== null) throw new AppError('Promotion not found', 404, 'PROMOTION_NOT_FOUND');
    if (promotion._count.usages > 0 || promotion.usedCount > 0) {
      throw new AppError('This code has been used on orders; switch it off instead of deleting it', 409, 'PROMOTION_IN_USE');
    }
    await prisma.promotion.delete({ where: { id: promotionId } });
    return { success: true };
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

