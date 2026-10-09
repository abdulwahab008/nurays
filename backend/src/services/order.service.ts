import { randomInt } from 'crypto';
import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { getPlatformDeliveryPricing } from './delivery-pricing.service';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { SELLER_COMMUNITY_DELIVERY_SELECT } from '../utils/sellerDeliverySelect';
import { communityService } from './community.service';
import { eligibleSubtotalForPromotion, isItemEligibleForPromotion, releasePromotionUsage } from './promotion.service';
import { allocateDiscount, priceOrder } from '../utils/pricing';
import { issueRefund, IssuedRefund } from './refund.service';
import { allocateHubStock, releaseHubAllocations } from './hub-allocation.service';
import { DeliveryFeeShare } from '../utils/deliveryEarnings';
import { isStoredFile, isPrivateRef, storedFileOwner, presentFile } from '../storage';
import { getDeliveryFeeForSeller, haversineKm } from '../utils/deliveryFee';
import { assertOnMenu } from '../utils/menu';
import { createStockAlert } from './stock-alert.service';
import promotionService from './promotion.service';
import { isAcceptingOrders, validateOrderTiming } from './availability.service';
import { SELLER_DIRECT_METHODS } from '../utils/paymentCustody';
import ledgerService from './ledger.service';
import { newHandoverCode } from './handover.service';
import { cancelOpenDelivery, notifyDeliveryCancelled, CancelledDelivery } from './delivery-lifecycle.service';
import { debitWallet } from './wallet.service';
import { notify } from './notify.service';

/** The kitchen a customer pays directly by transfer (the first item's seller). */
async function payeeSellerUserId(orderId: string): Promise<string | null> {
  const item = await prisma.orderItem.findFirst({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { seller: { select: { userId: true } } },
  });
  return item?.seller.userId ?? null;
}

// Once the food has left the kitchen, the customer can see where the rider is.
const ON_THE_WAY_STATUSES = ['picked_up', 'in_transit', 'arrived_at_customer'];

/**
 * What a party to an order sees of its delivery. The rider's pay is between the rider and
 * the platform. The rider's position is shown only while the food is on its way (never
 * afterwards), and only to the customer, the rider and admins.
 */
const RIDER_JOB_RUNNING = ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'];

/**
 * The order as the rider carrying it may see it: payment-submission details and internal keys
 * removed. The customer's door (address, pin, instructions) is theirs only while the job is
 * running; once it is delivered, failed or cancelled the rider keeps the area and city only,
 * the same as the rider endpoints.
 */
function stripForRider<T extends Record<string, unknown>>(order: T, jobRunning: boolean): T {
  const {
    paymentReferenceNumber: _r, paymentSenderName: _n, paymentSenderAccount: _a, paymentNotes: _p, paymentDisputeReason: _d,
    paymentTransactionId: _t, paymentConfirmedBy: _c, paymentSubmittedAt: _s, paymentConfirmedAt: _ca, idempotencyKey: _k,
    deliveryFeeBreakdown: _f, sellerDeliveryCharge: _sc, ...rest
  } = order as Record<string, unknown>;
  const address = rest.deliveryAddress as Record<string, unknown> | null | undefined;
  const snapshot = rest.deliveryAddressSnapshot as Record<string, unknown> | null | undefined;
  if (!jobRunning) {
    const areaOnly = (src: Record<string, unknown> | null | undefined) =>
      src && typeof src === 'object' ? { area: src.area ?? null, city: src.city ?? null } : null;
    rest.deliveryAddress = areaOnly(address);
    rest.deliveryAddressSnapshot = areaOnly(snapshot);
    rest.deliveryInstructions = null;
  } else if (address && typeof address === 'object') {
    const { userId: _u, ...addr } = address;
    rest.deliveryAddress = addr;
  }
  return rest as T;
}

function presentDelivery<
  D extends {
    status: string;
    riderFee: unknown;
    riderBonus: unknown;
    riderLatitude: unknown;
    riderLongitude: unknown;
    riderLocationAt: Date | null;
    deliveryLatitude: unknown;
    deliveryLongitude: unknown;
    rider: Record<string, unknown> | null;
  },
>(delivery: D, viewer: { canSeePay: boolean; canSeeLocation: boolean; riderFirstName: string | null }) {
  const { riderFee, riderBonus, riderLatitude, riderLongitude, riderLocationAt, ...rest } = delivery;
  const live = viewer.canSeeLocation && ON_THE_WAY_STATUSES.includes(delivery.status) && riderLatitude != null && riderLongitude != null;
  const doorKnown = delivery.deliveryLatitude != null && delivery.deliveryLongitude != null;
  return {
    ...rest,
    rider: delivery.rider ? { ...delivery.rider, name: viewer.riderFirstName } : null,
    ...(viewer.canSeePay ? { riderFee: riderFee != null ? Number(riderFee) : null, riderBonus: riderBonus != null ? Number(riderBonus) : null } : {}),
    riderLocation: live
      ? {
          latitude: Number(riderLatitude),
          longitude: Number(riderLongitude),
          updatedAt: riderLocationAt,
          // How far the rider is from the door, when the door's location is known.
          distanceKm: doorKnown
            ? Math.round(haversineKm(Number(riderLatitude), Number(riderLongitude), Number(delivery.deliveryLatitude), Number(delivery.deliveryLongitude)) * 10) / 10
            : null,
        }
      : null,
  };
}

export class OrderService {
  /**
   * Generate an order number: FN + date + 6 random digits (1,000,000 per day, from
   * a CSPRNG). The old 4-digit Math.random suffix had only 10,000 values a day, so
   * collisions became likely at a few hundred orders. Uniqueness is NOT assumed:
   * the database constraint is authoritative and withOrderNumber retries on a clash.
   */
  private generateOrderNumber(): string {
    const prefix = 'FN';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return `${prefix}${year}${month}${day}${random}`;
  }

  /**
   * Run `create` with a fresh order number, retrying with a new one if another
   * order took it first. A pre-insert "does it exist?" check can't be made safe —
   * two concurrent orders can both see it free — so the unique index decides and
   * the loser simply draws again.
   */
  private async withOrderNumber<T>(create: (orderNumber: string) => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        return await create(this.generateOrderNumber());
      } catch (err: any) {
        const target = err?.meta?.target;
        const isOrderNumberClash =
          err?.code === 'P2002' &&
          (Array.isArray(target) ? target.includes('order_number') || target.includes('orderNumber') : /order_?number/i.test(String(target ?? '')));
        // A deadlock / serialization failure aborts only this attempt; the whole
        // transaction is safe to run again.
        const isDeadlock = err?.code === 'P2034' || /deadlock detected|40P01/i.test(String(err?.message ?? ''));
        if (!(isOrderNumberClash || isDeadlock) || attempt >= MAX_ATTEMPTS) throw err;
      }
    }
  }

  /**
   * Calculate delivery fee.
   * Free when: self_pickup/hub_pickup, or subtotal >= 2000, or delivery address is in all sellers' freeDeliveryAreas.
   */
  private calculateDeliveryFee(
    deliveryType: string,
    subtotal: number,
    city?: string
  ): number {
    if (deliveryType === 'self_pickup' || deliveryType === 'hub_pickup') {
      return 0;
    }

    // Base delivery fee
    let fee = 100;

    // Free delivery for orders above 2000 PKR
    if (subtotal >= 2000) {
      return 0;
    }

    // City-based pricing (can be enhanced)
    if (city === 'Karachi' || city === 'Lahore' || city === 'Islamabad') {
      fee = 150;
    }

    return fee;
  }

  /**
   * Create order from items
   */
  async createOrder(
    customerId: string,
    data: {
      items: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
        stockType?: string;
        hubId?: string;
      }>;
      deliveryType: string;
      deliveryAddressId?: string;
      hubId?: string;
      deliverySlotDate?: string;
      deliverySlotTime?: string;
      paymentMethod: string;
      promotionCode?: string;
      deliveryInstructions?: string;
    },
    opts: { idempotencyKey?: string } = {}
  ) {
    // A retried checkout (same Idempotency-Key) gets the order it already placed.
    const idempotencyKey = opts.idempotencyKey || null;
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
        select: { id: true },
      });
      if (existing) return this.loadPlacedOrder(existing.id);
    }

    // Verify customer exists
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    }

    // Get delivery address if provided
    let deliveryAddress = null;
    if (data.deliveryAddressId) {
      deliveryAddress = await prisma.userAddress.findFirst({
        where: {
          id: data.deliveryAddressId,
          userId: customerId,
        },
      });

      if (!deliveryAddress) {
        throw new AppError('Delivery address not found', 404, 'ADDRESS_NOT_FOUND');
      }
    }

    // Hub ids come from the client: make sure they name real hubs, and that a
    // hub pickup actually has one. (A client-chosen hub also picks the origin
    // used for the delivery-fee calculation below.)
    const requestedHubIds = [
      ...new Set([data.hubId, ...data.items.map((i) => i.hubId)].filter((id): id is string => !!id)),
    ];
    if (data.deliveryType === 'hub_pickup' && !data.hubId) {
      throw new AppError('A pickup hub is required for hub pickup', 400, 'HUB_REQUIRED');
    }
    if (requestedHubIds.length > 0) {
      const foundHubs = await prisma.hubCenter.count({ where: { id: { in: requestedHubIds } } });
      if (foundHubs !== requestedHubIds.length) {
        throw new AppError('Hub not found', 404, 'HUB_NOT_FOUND');
      }
    }

    // Process items and calculate totals
    const orderItems: Array<{
      productId: string;
      variantId: string | null;
      variantName: string | null;
      sellerId: string;
      productName: string;
      productImage: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      commissionRate: any;
      commissionAmount: number;
      sellerPayout: number;
      promoDiscount: number;
      fulfillmentType: string;
      hubId: string | null;
    }> = [];
    let subtotal = 0;
    const sellersInOrder = new Map<string, any>();

    for (const item of data.items) {
      // Get product
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          seller: true,
        },
      });

      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404, 'PRODUCT_NOT_FOUND');
      }

      if (!product.isActive || product.approvalStatus !== 'approved') {
        throw new AppError(`Product ${product.name} is not available`, 400, 'PRODUCT_UNAVAILABLE');
      }
      // A weekly or daily dish must be on the menu on the day it is ordered for (the delivery slot's day, else today).
      assertOnMenu(product, data.deliverySlotDate ? new Date(data.deliverySlotDate) : new Date());

      sellersInOrder.set(product.seller.id, product.seller);

      // Delivery-mode gate: a seller can restrict which modes they actually offer.
      const wantsMode = data.deliveryType === 'self_pickup' || data.deliveryType === 'hub_pickup' ? 'pickup' : 'delivery';
      const offeredModes: string[] = product.seller.deliveryModes ?? ['delivery'];
      if (!offeredModes.includes(wantsMode)) {
        throw new AppError(
          `${product.seller.businessName} does not offer ${wantsMode === 'pickup' ? 'pickup' : 'delivery'}`,
          400,
          'DELIVERY_MODE_UNAVAILABLE'
        );
      }

      // Resolve the variant, if one was requested — it drives price + stock instead of the base product.
      let variant = null;
      if (item.variantId) {
        variant = await prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id, isActive: true },
        });
        if (!variant) {
          throw new AppError(`Variant not found for ${product.name}`, 404, 'VARIANT_NOT_FOUND');
        }
      }

      // Check stock
      const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
      if (availableStock < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name}${variant ? ` (${variant.name})` : ''}. Available: ${availableStock}`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      // Where the item is fulfilled from is decided by the product, not the request: a hub id on
      // an item the kitchen ships itself would otherwise re-price the delivery as Nuray's and
      // charge the kitchen for it.
      const fulfillmentType =
        product.stockType === 'hub' || (product.stockType === 'both' && item.stockType === 'hub') ? 'hub' : 'direct';
      if (item.hubId && fulfillmentType !== 'hub') {
        throw new AppError(`${product.name} is not stocked at a hub`, 400, 'HUB_NOT_APPLICABLE');
      }

      // List/catalog price — the seller-wide "deal" discount below is applied on top of this.
      const listPrice = variant ? Number(variant.price) : Number(product.price);

      // Get product primary image
      const productImage = await prisma.productImage.findFirst({
        where: {
          productId: product.id,
          isPrimary: true,
        },
        select: {
          imageUrl: true,
        },
      });

      orderItems.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        sellerId: product.seller.id,
        productName: product.name,
        productImage: productImage?.imageUrl || null,
        quantity: item.quantity,
        unitPrice: listPrice,
        totalPrice: listPrice * item.quantity,
        commissionRate: product.seller.commissionRate,
        commissionAmount: 0,
        sellerPayout: 0,
        promoDiscount: 0,
        fulfillmentType,
        hubId: fulfillmentType === 'hub' ? item.hubId || null : null,
      });
    }

    // One kitchen per order. The cart already enforces it; the API must too: a manual
    // transfer goes to one seller's account, and payouts, refunds and delivery are all
    // settled per order.
    if (sellersInOrder.size > 1) {
      throw new AppError(
        'An order can only contain items from one kitchen. Please place a separate order for each kitchen.',
        400,
        'MULTI_SELLER_ORDER'
      );
    }
    // A seller ordering from their own kitchen could confirm a transfer that never
    // happened, mark it delivered and draw a payout (or leave themselves reviews).
    for (const seller of sellersInOrder.values()) {
      if (seller.userId === customerId) {
        throw new AppError("You can't place an order with your own kitchen", 400, 'SELF_ORDER');
      }
    }

    // Every seller in the order must currently be accepting orders — schedule,
    // manual override, order cutoff, daily cap, and pre-order-only are all
    // enforced here rather than trusting whatever the browsing page displayed.
    for (const seller of sellersInOrder.values()) {
      const timing = validateOrderTiming(seller, data.deliverySlotDate);
      if (!timing.valid) {
        throw new AppError(`${seller.businessName}: ${timing.reason}`, 400, 'ORDER_TIMING_INVALID');
      }
      const accepting = await isAcceptingOrders(seller, new Date(), data.deliverySlotDate);
      if (!accepting.accepting) {
        throw new AppError(`${seller.businessName}: ${accepting.reason}`, 400, 'SELLER_NOT_ACCEPTING_ORDERS');
      }
    }

    // Apply seller-wide catalog/deal promotions to the actual charged unit price —
    // the same discount the product/cart/checkout pages already show, so what's
    // charged always matches what the customer saw (see promotion.service.ts).
    const { discountedUnitPrices, usagesToRecord: catalogUsagesToRecord } =
      await promotionService.computeOrderCatalogDiscounts(
        customerId,
        orderItems.map((i) => ({
          productId: i.productId,
          sellerId: i.sellerId,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
        }))
      );
    orderItems.forEach((item, i) => {
      const discountedUnitPrice = discountedUnitPrices[i];
      item.unitPrice = discountedUnitPrice;
      item.totalPrice = discountedUnitPrice * item.quantity;
      const commissionRate = Number(item.commissionRate) / 100;
      item.commissionAmount = item.totalPrice * commissionRate;
      item.sellerPayout = item.totalPrice - item.commissionAmount;
      subtotal += item.totalPrice;
    });

    // Calculate delivery fee: per-seller (free in their areas, fixed or distance-based outside), then sum
    let deliveryFee: number;
    // What the kitchen pays Nuray for a Nuray rider's delivery (the customer pays no delivery fee for it).
    let sellerDeliveryCharge = 0;
    const deliveryFeeBreakdown: DeliveryFeeShare[] = [];
    if (data.deliveryType === 'home_delivery' && !deliveryAddress) {
      // The delivery address carries the buyer's community, which decides whether
      // each seller delivers there and at what fee — it can't be skipped.
      throw new AppError('A delivery address is required for home delivery', 400, 'ADDRESS_REQUIRED');
    }
    if (data.deliveryType === 'self_pickup' || data.deliveryType === 'hub_pickup') {
      deliveryFee = 0;
    } else if (data.deliveryType === 'home_delivery' && deliveryAddress && orderItems.length > 0) {
      const uniqueSellerIds = [...new Set(orderItems.map((i) => i.sellerId))];
      const sellerToHubId = new Map<string, string | null>();
      for (const item of orderItems) {
        if (!sellerToHubId.has(item.sellerId)) sellerToHubId.set(item.sellerId, item.hubId);
      }
      const sellers = await prisma.seller.findMany({
        where: { id: { in: uniqueSellerIds } },
        select: {
          id: true,
          businessName: true,
          freeDeliveryAreas: true,
          freeDeliveryRadiusKm: true,
          latitude: true,
          longitude: true,
          deliveryFeeType: true,
          deliveryFeeFixed: true,
          deliveryFeeBase: true,
          deliveryFeePerKm: true,
          distancePricingTiers: true,
          maxDeliveryDistanceKm: true,
          minOrderAmountForDelivery: true,
          freeDeliveryThreshold: true,
          allowedPostalCodes: true,
          deliveryZones: true,
          ...SELLER_COMMUNITY_DELIVERY_SELECT,
        },
      });
      const hubIds = [...sellerToHubId.values()].filter((id): id is string => id != null);
      const hubs = hubIds.length > 0
        ? await prisma.hubCenter.findMany({
            where: { id: { in: hubIds } },
            select: { id: true, latitude: true, longitude: true },
          })
        : [];
      const hubById = new Map(hubs.map((h) => [h.id, h]));
      const resolvedCommunityId = deliveryAddress.communityId ?? (await communityService.resolveCommunityIdForAddress(deliveryAddress, customerId));
      const addr = {
        area: deliveryAddress.area,
        city: deliveryAddress.city,
        postalCode: deliveryAddress.postalCode,
        latitude: deliveryAddress.latitude != null ? Number(deliveryAddress.latitude) : null,
        longitude: deliveryAddress.longitude != null ? Number(deliveryAddress.longitude) : null,
        communityId: resolvedCommunityId,
      communityUnresolved: !resolvedCommunityId,
      };
      const pricing = await getPlatformDeliveryPricing();
      let total = 0;
      for (const seller of sellers) {
        const hubId = sellerToHubId.get(seller.id) ?? null;
        const hub = hubId ? hubById.get(hubId) : null;
        const originLat = hub?.latitude != null ? Number(hub.latitude) : (seller.latitude != null ? Number(seller.latitude) : null);
        const originLng = hub?.longitude != null ? Number(hub.longitude) : (seller.longitude != null ? Number(seller.longitude) : null);
        const sellerSubtotal = orderItems
          .filter((i) => i.sellerId === seller.id)
          .reduce((sum, i) => sum + i.totalPrice, 0);
        const result = getDeliveryFeeForSeller(seller, addr, originLat, originLng, sellerSubtotal, { pricing, forcePlatform: !!hub });
        if (!result.deliverable) {
          throw new AppError(`${seller.businessName}: ${result.reason}`, 400, 'ADDRESS_NOT_DELIVERABLE');
        }
        // A fee priced by Nuray (result.pricing) is for a Nuray rider: the kitchen pays it.
        const paidByKitchen = result.pricing != null;
        if (paidByKitchen) sellerDeliveryCharge += result.fee;
        else total += result.fee;
        if (result.fee > 0) {
          deliveryFeeBreakdown.push({
            sellerId: seller.id,
            fee: result.fee,
            provider: paidByKitchen ? 'platform' : 'self',
            paidBy: paidByKitchen ? 'seller' : 'customer',
          });
        }
      }
      deliveryFee = total;
    } else {
      deliveryFee = this.calculateDeliveryFee(
        data.deliveryType,
        subtotal,
        deliveryAddress?.city || undefined
      );
    }

    // Apply promotion code if provided
    let discountAmount = 0;
    let promotionId = null;
    if (data.promotionCode) {
      const promotion = await prisma.promotion.findUnique({
        where: { code: data.promotionCode.trim().toUpperCase() },
      });

      // This exact promotion is already auto-applied as a catalog deal on one or more
      // items above — reject the code instead of silently stacking a second discount
      // for the same promotion on top of itself.
      if (promotion && catalogUsagesToRecord.some((u) => u.promotionId === promotion.id)) {
        throw new AppError(
          'This promotion is already applied to your order automatically',
          400,
          'PROMO_ALREADY_APPLIED'
        );
      }

      // The code must be real and usable. A code that is unknown, switched off, expired, used up or
      // below its minimum is refused with the same answers as /promotions/validate, instead of the
      // order going through at full price as if no code had been typed.
      if (!promotion) throw new AppError('Invalid promotion code', 400, 'INVALID_PROMO_CODE');
      if (!promotion.isActive) throw new AppError('Promotion code is not active', 400, 'PROMO_INACTIVE');
      {
        const now = new Date();
        if (now < promotion.validFrom || now > promotion.validUntil) {
          throw new AppError('Promotion code has expired', 400, 'PROMO_EXPIRED');
        }
        if (promotion.usageLimitTotal && promotion.usedCount >= promotion.usageLimitTotal) {
          throw new AppError('Promotion code usage limit reached', 400, 'PROMO_LIMIT_REACHED');
        }
        const usedByUser = await prisma.promotionUsage.count({ where: { promotionId: promotion.id, userId: customerId } });
        if (usedByUser >= promotion.usageLimitPerUser) {
          throw new AppError('You have already used this promotion code', 400, 'PROMO_ALREADY_USED');
        }

        {
          // A seller's code (or a product-limited code) only discounts the
          // matching items — never the rest of a multi-seller cart.
          const eligibleSubtotal = eligibleSubtotalForPromotion(
            promotion,
            orderItems.map((i) => ({ productId: i.productId, sellerId: i.sellerId, total: i.totalPrice }))
          );
          if (eligibleSubtotal <= 0) {
            throw new AppError(
              'This promotion code does not apply to the items in your order',
              400,
              'PROMO_NOT_APPLICABLE'
            );
          }
          if (eligibleSubtotal < Number(promotion.minOrderAmount)) {
            throw new AppError(`Minimum order amount is ${promotion.minOrderAmount}`, 400, 'MIN_ORDER_NOT_MET');
          }
          {
            if (promotion.discountType === 'percentage') {
              discountAmount = eligibleSubtotal * (Number(promotion.discountValue) / 100);
              if (promotion.maxDiscountAmount) {
                discountAmount = Math.min(discountAmount, Number(promotion.maxDiscountAmount));
              }
            } else {
              discountAmount = Number(promotion.discountValue);
            }
            // Never let a discount exceed the part of the order it applies to.
            discountAmount = Math.min(discountAmount, eligibleSubtotal);
            promotionId = promotion.id;

            // Record each eligible item's share of the discount (to the cent), so a later partial
            // cancel refunds exactly what the customer paid for that item.
            const eligibleItems = orderItems.filter((i) =>
              isItemEligibleForPromotion(promotion, { productId: i.productId, sellerId: i.sellerId, total: i.totalPrice })
            );
            const shares = allocateDiscount(eligibleItems.map((i) => ({ total: i.totalPrice })), discountAmount);
            eligibleItems.forEach((i, idx) => {
              i.promoDiscount = shares[idx];
              // A seller's own code is funded by the seller: their share (and the commission
              // on it) is worked out on what the customer actually pays for the item. A
              // platform code is funded by the platform, so the seller's share is unchanged.
              if (promotion.sellerId) {
                const net = i.totalPrice - i.promoDiscount;
                i.commissionAmount = net * (Number(i.commissionRate) / 100);
                i.sellerPayout = net - i.commissionAmount;
              }
            });
          }
        }
      }
    }

    // Who delivers (snapshotted, so a seller changing their setting later doesn't move
    // existing orders): hub stock always goes with a platform rider.
    const onlySeller = sellersInOrder.values().next().value;
    const deliveryProvider =
      data.deliveryType !== 'home_delivery'
        ? null
        : orderItems.some((i) => i.fulfillmentType === 'hub') || onlySeller?.deliveryProvider !== 'self'
          ? 'platform'
          : 'self';

    // 5% GST on the goods after discounts; the total in whole rupees (see priceOrder).
    const { taxAmount, totalAmount } = priceOrder(subtotal - discountAmount, deliveryFee);

    // Create order with items in transaction (retried with a new number on a clash)
    let order: Awaited<ReturnType<typeof placeOrder>>;
    const placeOrder = () => this.withOrderNumber((orderNumber) => prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          idempotencyKey,
          handoverCode: newHandoverCode(),
          subtotal,
          deliveryFee,
          sellerDeliveryCharge,
          deliveryFeeBreakdown: deliveryFeeBreakdown as any,
          deliveryProvider,
          discountAmount,
          taxAmount,
          totalAmount,
          paymentMethod: data.paymentMethod,
          paymentStatus: 'pending',
          deliveryType: data.deliveryType,
          deliveryAddressId: data.deliveryAddressId,
          // Everything the rider needs to find the door, frozen at order time: editing or deleting the
          // saved address later must not move an order that is already on its way.
          deliveryAddressSnapshot: deliveryAddress
            ? ({
                addressLine1: deliveryAddress.addressLine1,
                addressLine2: deliveryAddress.addressLine2,
                area: deliveryAddress.area,
                city: deliveryAddress.city,
                postalCode: deliveryAddress.postalCode,
                houseNumber: deliveryAddress.houseNumber ?? null,
                landmark: deliveryAddress.landmark ?? null,
                latitude: deliveryAddress.latitude != null ? Number(deliveryAddress.latitude) : null,
                longitude: deliveryAddress.longitude != null ? Number(deliveryAddress.longitude) : null,
              } as any)
            : undefined,
          hubId: data.hubId,
          deliverySlotDate: data.deliverySlotDate ? new Date(data.deliverySlotDate) : null,
          deliverySlotTime: data.deliverySlotTime,
          deliveryInstructions: data.deliveryInstructions,
          orderStatus: 'pending',
        },
      });

      // Create order items
      const createdItems = await Promise.all(
        orderItems.map((item) =>
          tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: item.productId,
              variantId: item.variantId,
              variantName: item.variantName,
              sellerId: item.sellerId,
              productName: item.productName,
              productImage: item.productImage,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              commissionRate: item.commissionRate,
              commissionAmount: item.commissionAmount,
              sellerPayout: item.sellerPayout,
              promoDiscount: item.promoDiscount,
              fulfillmentType: item.fulfillmentType,
              hubId: item.hubId,
              status: 'pending',
            },
          })
        )
      );

      // Update stock: variant stock when the item is a specific variant, else the base product.
      const updatedProducts: Array<{
        id: string;
        sellerId: string;
        variantId: string | null;
        stockQuantity: number;
        stockThreshold: number | null;
      }> = [];
      // Fixed lock order (by variant/product id) so two orders touching the same
      // products can't deadlock each other.
      const stockOrdered = [...orderItems].sort((a, b) =>
        (a.productId + (a.variantId ?? '')).localeCompare(b.productId + (b.variantId ?? ''))
      );
      for (const item of stockOrdered) {
        if (item.variantId) {
          // Conditional decrement: the stock check above ran on a pre-transaction
          // read, so two concurrent orders (or two lines for the same product)
          // could both pass it and drive stock negative. The WHERE makes the
          // check-and-take atomic; losing the race aborts the whole order.
          const took = await tx.productVariant.updateMany({
            where: { id: item.variantId, stockQuantity: { gte: item.quantity } },
            data: { stockQuantity: { decrement: item.quantity } },
          });
          if (took.count === 0) {
            throw new AppError(`Insufficient stock for ${item.productName}`, 400, 'INSUFFICIENT_STOCK');
          }
          const updatedVariant = await tx.productVariant.findUniqueOrThrow({ where: { id: item.variantId } });
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { totalOrders: { increment: 1 } },
          });
          updatedProducts.push({
            id: updated.id,
            sellerId: updated.sellerId,
            variantId: item.variantId,
            stockQuantity: updatedVariant.stockQuantity,
            stockThreshold: updatedVariant.stockThreshold,
          });
        } else {
          const took = await tx.product.updateMany({
            where: { id: item.productId, stockQuantity: { gte: item.quantity } },
            data: { stockQuantity: { decrement: item.quantity } },
          });
          if (took.count === 0) {
            throw new AppError(`Insufficient stock for ${item.productName}`, 400, 'INSUFFICIENT_STOCK');
          }
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { totalOrders: { increment: 1 } },
          });
          updatedProducts.push({
            id: updated.id,
            sellerId: updated.sellerId,
            variantId: null,
            stockQuantity: updated.stockQuantity,
            stockThreshold: null,
          });
        }
      }

      // FEFO (First-Expired, First-Out) Hub Batch Allocation & Reservation. Shortfalls
      // throw (rolling the whole order back) rather than creating an order whose
      // hub units were never actually taken.
      const hubOrdered = orderItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.fulfillmentType === 'hub' && item.hubId)
        .sort((a, b) => (a.item.hubId! + a.item.productId).localeCompare(b.item.hubId! + b.item.productId));
      for (const { item, idx } of hubOrdered) {
        {
          await allocateHubStock(tx, {
            orderId: newOrder.id,
            orderItemId: createdItems[idx].id,
            orderNumber: newOrder.orderNumber,
            hubId: item.hubId!,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            performedBy: customerId,
          });

          await tx.inventoryReservation.create({
            data: {
              productId: item.productId,
              quantity: item.quantity,
              reservationType: 'order',
              reservationId: newOrder.id,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
          });
        }
      }

      // Create order status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          status: 'pending',
          notes: 'Order created',
        },
      });

      // Record usage for every promotion actually applied — the manually-entered
      // code (if any) plus every seller-wide catalog deal baked into an item's price.
      const allUsagesToRecord = [...catalogUsagesToRecord];
      if (promotionId) {
        allUsagesToRecord.push({ promotionId, discountApplied: discountAmount });
      }
      for (const usage of allUsagesToRecord) {
        // One checkout at a time per promotion: the limits are re-read under a row lock, so two
        // simultaneous orders cannot both pass a count that neither has yet incremented.
        await tx.$queryRaw`SELECT id FROM promotions WHERE id = ${usage.promotionId} FOR NO KEY UPDATE`;
        const promo = await tx.promotion.findUniqueOrThrow({ where: { id: usage.promotionId } });
        const isCode = usage.promotionId === promotionId;
        if (isCode) {
          const usedByUser = await tx.promotionUsage.count({
            where: { promotionId: usage.promotionId, userId: customerId },
          });
          if (usedByUser >= promo.usageLimitPerUser) {
            throw new AppError('You have already used this promotion code', 400, 'PROMO_ALREADY_USED');
          }
        }
        if (promo.usageLimitTotal != null) {
          const reserved = await tx.promotion.updateMany({
            where: { id: usage.promotionId, usedCount: { lt: promo.usageLimitTotal } },
            data: { usedCount: { increment: 1 } },
          });
          if (reserved.count === 0) {
            throw new AppError(
              isCode ? 'Promotion code usage limit reached' : 'A deal on this order has just run out; please try again',
              400,
              'PROMO_LIMIT_REACHED'
            );
          }
        } else {
          await tx.promotion.update({
            where: { id: usage.promotionId },
            data: { usedCount: { increment: 1 } },
          });
        }
        await tx.promotionUsage.create({
          data: {
            promotionId: usage.promotionId,
            userId: customerId,
            orderId: newOrder.id,
            discountApplied: usage.discountApplied,
          },
        });
      }

      // Paying from the Nuray Wallet: the debit commits with the order or not at all, so an
      // order is never left waiting for wallet money that isn't there.
      if (data.paymentMethod === 'wallet') {
        await debitWallet(tx, {
          userId: customerId,
          amount: Number(newOrder.totalAmount),
          orderId: newOrder.id,
          description: `Payment for order ${newOrder.orderNumber}`,
        });
        await tx.order.update({
          where: { id: newOrder.id },
          data: { paymentStatus: 'paid', paymentCollectedBy: 'platform', paidAt: new Date(), paymentTransactionId: `WALLET-${newOrder.id}` },
        });
      }

      return { order: newOrder, items: createdItems, updatedProducts };
    }));
    try {
      order = await placeOrder();
    } catch (err: any) {
      // The same checkout submitted twice at once: the other request placed it.
      const target = String(err?.meta?.target ?? '');
      if (idempotencyKey && err?.code === 'P2002' && /idempotency/i.test(target)) {
        const existing = await prisma.order.findUnique({
          where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
          select: { id: true },
        });
        if (existing) return this.loadPlacedOrder(existing.id);
      }
      throw err;
    }

    // The order is committed: nothing after this point may fail the request (a client
    // that saw an error would retry and, without a key, place it twice).
    try {
      await realtimeOrderService.emitNewOrderNotification(order.order.id);
    } catch (err) {
      console.error(`New-order notification failed for ${order.order.id}:`, err);
    }

    // Low-stock / out-of-stock alerts (may send email): in the background, never
    // holding up the customer's checkout.
    void this.raiseStockAlerts(order.updatedProducts).catch((err) =>
      console.error('Stock alerts after order failed:', err)
    );

    return this.loadPlacedOrder(order.order.id);
  }

  /** Low-stock / out-of-stock alerts for products an order just depleted. */
  private async raiseStockAlerts(
    updatedProducts: Array<{ id: string; sellerId: string; variantId: string | null; stockQuantity: number; stockThreshold: number | null }>
  ) {
    for (const p of updatedProducts) {
      let threshold = p.stockThreshold ?? 10;
      if (p.stockThreshold == null) {
        const seller = await prisma.seller.findUnique({
          where: { id: p.sellerId },
          select: { lowStockThreshold: true },
        });
        threshold = seller?.lowStockThreshold ?? 10;
      }
      if (p.stockQuantity <= 0) {
        await createStockAlert({
          sellerId: p.sellerId,
          productId: p.id,
          variantId: p.variantId,
          alertType: 'out_of_stock',
          currentStock: p.stockQuantity,
          threshold,
        });
      } else if (p.stockQuantity <= threshold) {
        await createStockAlert({
          sellerId: p.sellerId,
          productId: p.id,
          variantId: p.variantId,
          alertType: 'low_stock',
          currentStock: p.stockQuantity,
          threshold,
        });
      }
    }

  }

  /** The placed order with what the checkout response needs. */
  private async loadPlacedOrder(orderId: string) {
    const fullOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
        deliveryAddress: true,
        hub: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return fullOrder;
  }

  /**
   * Get user orders
   */
  async getUserOrders(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
    }
  ) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const where: any = {
      customerId: userId,
    };

    if (filters.status) {
      where.orderStatus = filters.status;
    }

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              productImage: true,
              quantity: true,
              status: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
      // Whole-history totals for the summary cards (not just the loaded page).
      prisma.order.groupBy({ by: ['orderStatus'], where: { customerId: userId }, _count: { _all: true } }),
    ]);

    return {
      orders: orders.map((order) => {
        // Compute effective status: if DB says pending but every item is cancelled,
        // the order is functionally cancelled (backend bug guard for legacy records).
        const allCancelled =
          order.items.length > 0 &&
          order.items.every((item) => item.status === 'cancelled');
        const effectiveOrderStatus =
          order.orderStatus === 'pending' && allCancelled
            ? 'cancelled'
            : order.orderStatus;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: Number(order.totalAmount),
          orderStatus: effectiveOrderStatus,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
          estimatedDeliveryAt: order.estimatedDeliveryAt,
          itemsCount: order._count.items,
          items: order.items.slice(0, 3),
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statusCounts: Object.fromEntries(statusGroups.map((g) => [g.orderStatus, g._count._all])),
    };
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true, email: true },
    });

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';
    const viewerRider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                businessNameUrdu: true,
              },
            },
          },
        },
        deliveryAddress: true,
        hub: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            area: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        delivery: {
          include: {
            rider: {
              select: {
                id: true,
                vehicleType: true,
                vehicleNumber: true,
                ratingAverage: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // The handover code is shown to the customer only: the rider or seller who hands the
    // order over has to get it from them.
    const handover =
      order.customerId === userId
        ? await prisma.order.findUnique({ where: { id: order.id }, select: { handoverCode: true } })
        : null;

    const isOrderRider = !!viewerRider && order.delivery?.riderId === viewerRider.id;
    const isSeller = !!seller && order.items.some((i: { sellerId: string }) => i.sellerId === seller.id);
    // The customer is told their rider's first name.
    const riderUserId = order.delivery?.riderId
      ? (await prisma.rider.findUnique({ where: { id: order.delivery.riderId }, select: { userId: true } }))?.userId
      : null;
    const riderFullName = riderUserId
      ? (await prisma.userProfile.findUnique({ where: { userId: riderUserId }, select: { fullName: true } }))?.fullName
      : null;

    // A rider delivering the order needs the food, the door, the amount to collect and how it is
    // paid; not the customer's bank details, receipt, the kitchen's fee breakdown or internal keys.
    const riderOnly = isOrderRider && !isAdmin && order.customerId !== userId && !isSeller;
    const forViewer = riderOnly ? stripForRider(order, RIDER_JOB_RUNNING.includes(order.delivery?.status ?? '')) : order;

    return {
      ...forViewer,
      delivery: order.delivery
        ? presentDelivery(order.delivery, {
            canSeePay: isAdmin || isOrderRider,
            canSeeLocation: isAdmin || isOrderRider || order.customerId === userId,
            riderFirstName: riderFullName?.trim().split(/\s+/)[0] || null,
          })
        : null,
      ...(handover ? { handoverCode: handover.handoverCode } : {}),
      // The receipt is private: the viewer (already checked above) gets a short-lived link.
      paymentProofUrl: riderOnly ? null : await presentFile(order.paymentProofUrl),
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
    };
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Customer can only cancel while order is still pending (before seller has accepted)
    if (order.orderStatus !== 'pending') {
      throw new AppError(
        `Order cannot be cancelled. Current status: ${order.orderStatus}. Cancellation is only allowed before the seller confirms.`,
        400,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    // Cancel order and restore stock
    let refundIssued = null as IssuedRefund | null;
    let cancelledDelivery = null as CancelledDelivery | null;
    const cancelledOrder = await prisma.$transaction(async (tx) => {
      // Claim the cancellation: the "still pending" check above ran before this
      // transaction, so a seller accepting at the same instant (or a second
      // cancel) must not both win — otherwise the order is revived after its
      // stock was returned, or its stock is returned twice.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, customerId: userId, orderStatus: 'pending' },
        data: {
          orderStatus: 'cancelled',
          cancellationReason: reason,
          cancelledBy: 'customer',
        },
      });
      if (claimed.count > 0) cancelledDelivery = await cancelOpenDelivery(tx, orderId, `Cancelled by the customer: ${reason}`);
      if (claimed.count === 0) {
        throw new AppError('Order can no longer be cancelled', 409, 'ORDER_NOT_CANCELLABLE');
      }
      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      // Items a seller already cancelled were restocked at that time; only
      // return stock for what is still live. Read before the cascade below.
      const liveItems = await tx.orderItem.findMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
      });

      // Cascade cancellation to all order items so the seller UI doesn't
      // show stale "Pending/Confirmed/Preparing" rows with action buttons
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'cancelled' },
      });

      // Restore stock. A variant item drew from its own stock pool at order
      // time, so it goes back there — not onto the shared product-level stock.
      for (const item of liveItems) {
        if (!item.productId) continue;
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: {
            ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
            totalOrders: { decrement: 1 },
          },
        });
      }

      // A cancelled order shouldn't keep consuming the promo's quota.
      await releasePromotionUsage(tx, orderId);

      // Hub units this order took go back into the batches they came from.
      await releaseHubAllocations(tx, orderId, { reason: `Order ${order.orderNumber} cancelled by customer`, performedBy: userId });

      // A paid order (wallet payment, or a gateway payment that already cleared)
      // is owed its money back: wallet orders are refunded instantly, the rest
      // are queued for the admin to send.
      refundIssued = await issueRefund(tx, orderId, {
        reason: `Order cancelled by customer: ${reason}`,
        createdBy: userId,
      });

      // Remove inventory reservations
      await tx.inventoryReservation.deleteMany({
        where: {
          reservationType: 'order',
          reservationId: orderId,
        },
      });

      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'cancelled',
          notes: `Cancelled by customer. Reason: ${reason}`,
          changedBy: userId,
        },
      });

      return updatedOrder;
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(cancelledOrder.id, 'cancelled', userId);
    notifyDeliveryCancelled(cancelledDelivery);

    return {
      orderId: cancelledOrder.id,
      status: cancelledOrder.orderStatus,
      refundAmount: refundIssued?.amount ?? 0,
      refundStatus: refundIssued
        ? refundIssued.status === 'completed'
          ? 'refunded_to_wallet'
          : 'pending_manual_transfer'
        : 'not_required',
    };
  }

  /**
   * Get seller account details for manual online payment (Bank, JazzCash, EasyPaisa)
   */
  async getSellerPaymentDetails(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: {
          take: 1,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                bankName: true,
                bankAccountName: true,
                bankAccountNumber: true,
                jazzcashNumber: true,
                jazzcashAccountTitle: true,
                easypaisaNumber: true,
                easypaisaAccountTitle: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    const seller = order.items[0]?.seller;

    // Only accounts the seller has actually configured. The customer sends real
    // money to whatever is listed here, so there are no placeholder fallbacks —
    // a seller with nothing configured yields an empty list.
    const accounts: Array<{ provider: string; accountTitle?: string; accountNumber: string }> = [];
    if (seller?.jazzcashNumber) {
      accounts.push({
        provider: 'JazzCash',
        accountTitle: seller.jazzcashAccountTitle || seller.businessName,
        accountNumber: seller.jazzcashNumber,
      });
    }
    if (seller?.easypaisaNumber) {
      accounts.push({
        provider: 'EasyPaisa',
        accountTitle: seller.easypaisaAccountTitle || seller.businessName,
        accountNumber: seller.easypaisaNumber,
      });
    }
    if (seller?.bankAccountNumber) {
      accounts.push({
        provider: seller.bankName || 'Bank Transfer',
        accountTitle: seller.bankAccountName || seller.businessName,
        accountNumber: seller.bankAccountNumber,
      });
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentSubmittedAt: order.paymentSubmittedAt,
      paymentReferenceNumber: order.paymentReferenceNumber,
      sellerId: seller?.id ?? null,
      sellerName: seller?.businessName ?? null,
      accounts,
    };
  }

  /**
   * Buyer submits manual payment details (TID / reference / proof)
   */
  async submitManualPayment(
    orderId: string,
    userId: string,
    data: {
      referenceNumber: string;
      senderName?: string;
      senderAccount?: string;
      proofUrl?: string;
      notes?: string;
    }
  ) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already marked as paid', 400, 'ALREADY_PAID');
    }

    // Manual proof only makes sense for an online-transfer order that is still
    // awaiting payment — not a cancelled/refunded order, and not COD or wallet.
    if (['cancelled', 'refunded'].includes(order.orderStatus)) {
      throw new AppError('This order is no longer payable', 400, 'ORDER_NOT_PAYABLE');
    }
    if (['cod', 'wallet'].includes(order.paymentMethod)) {
      throw new AppError('This order is not paid by manual transfer', 400, 'NOT_MANUAL_PAYMENT');
    }

    const referenceNumber = (data.referenceNumber ?? '').trim();
    if (!referenceNumber) {
      throw new AppError('A payment reference number is required', 400, 'REFERENCE_REQUIRED');
    }
    // A proof is a link to an uploaded file — never an inline data: payload.
    // And it must be a receipt this customer uploaded (stored privately).
    if (
      data.proofUrl &&
      (!isStoredFile(data.proofUrl, { private: 'proofs' }) ||
        (isPrivateRef(data.proofUrl) && storedFileOwner(data.proofUrl) !== userId))
    ) {
      throw new AppError('Invalid payment proof link', 400, 'INVALID_PROOF_URL');
    }

    // Atomic: only an order still awaiting (or re-submitting/contesting) payment
    // can move to payment_submitted; never overwrite refund_pending/refunded/paid.
    const submitted = await prisma.order.updateMany({
      where: {
        id: orderId,
        customerId: userId,
        paymentStatus: { in: ['pending', 'failed', 'disputed', 'payment_submitted'] },
      },
      data: {
        paymentStatus: 'payment_submitted',
        paymentReferenceNumber: referenceNumber,
        paymentSenderName: data.senderName,
        paymentSenderAccount: data.senderAccount,
        paymentProofUrl: data.proofUrl,
        paymentNotes: data.notes,
        paymentSubmittedAt: new Date(),
      },
    });
    if (submitted.count === 0) {
      throw new AppError('Payment can no longer be submitted for this order', 409, 'PAYMENT_STATE_CONFLICT');
    }
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    // Add status history record
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: `Payment submitted by customer. Reference/TID: ${data.referenceNumber}`,
        changedBy: userId,
      },
    });

    // Notify via realtime
    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, userId);
    // The kitchen the money went to checks its account.
    const payee = await payeeSellerUserId(orderId);
    if (payee) {
      await notify({
        userId: payee,
        category: 'payments',
        type: 'payment',
        title: `Check a payment: order #${updated.orderNumber}`,
        message: `The customer says they sent Rs ${Number(updated.totalAmount).toLocaleString()} (reference ${data.referenceNumber}). Confirm it once it's in your account.`,
        actionUrl: `/sellers/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }

    return {
      success: true,
      orderId: updated.id,
      paymentStatus: updated.paymentStatus,
      paymentReferenceNumber: updated.paymentReferenceNumber,
      paymentSubmittedAt: updated.paymentSubmittedAt,
    };
  }

  /**
   * Seller confirms or disputes manual payment
   */
  async confirmManualPayment(
    orderId: string,
    sellerUserId: string,
    confirmed: boolean,
    disputeReason?: string
  ) {
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });

    if (!seller) {
      throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
    }

    // Only the seller the customer was told to pay (the same one
    // getSellerPaymentDetails shows) may confirm or dispute the transfer; other
    // sellers on a multi-seller order must not be able to mark it paid.
    const order = await prisma.order.findFirst({
      where: { id: orderId, items: { some: { sellerId: seller.id } } },
      include: { items: { take: 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { sellerId: true } } },
    });

    if (!order) {
      throw new AppError('Order not found for this seller', 404, 'ORDER_NOT_FOUND');
    }
    if (order.items[0]?.sellerId !== seller.id) {
      throw new AppError('Only the seller receiving this payment can confirm it', 403, 'NOT_PAYEE');
    }
    if (['cancelled', 'refunded'].includes(order.orderStatus) || !SELLER_DIRECT_METHODS.includes(order.paymentMethod)) {
      throw new AppError('This order has no manual payment to confirm', 400, 'NOT_MANUAL_PAYMENT');
    }

    const newPaymentStatus = confirmed ? 'paid' : 'disputed';

    // Atomic, and only from payment_submitted: a seller can't mark an order paid
    // that the customer never paid for (which would unlock a payout for money
    // the platform never received), nor flip a refunded order back to paid.
    const applied = await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'payment_submitted' },
      data: {
        paymentStatus: newPaymentStatus,
        // The transfer went into the seller's own account.
        paymentCollectedBy: confirmed ? 'seller' : undefined,
        paymentConfirmedBy: confirmed ? 'seller' : undefined,
        paymentConfirmedAt: confirmed ? new Date() : undefined,
        paidAt: confirmed ? new Date() : undefined,
        paymentDisputeReason: !confirmed ? disputeReason || 'Payment verification failed' : null,
      },
    });
    if (applied.count === 0) {
      throw new AppError(
        'There is no submitted payment awaiting confirmation on this order',
        409,
        'NO_PAYMENT_SUBMITTED'
      );
    }
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: confirmed
          ? 'Payment verified and marked as PAID by seller'
          : `Payment disputed by seller: ${disputeReason || 'Payment not received'}`,
        changedBy: sellerUserId,
      },
    });

    // A transfer confirmed after the order was already delivered posts its ledger
    // entries now (they're only posted once the money is actually in).
    if (confirmed && ['delivered', 'completed'].includes(updated.orderStatus)) {
      await ledgerService.recordOrderCompletion(orderId).catch((err) =>
        console.error(`Ledger posting failed for order ${orderId}:`, err)
      );
    }

    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, sellerUserId);
    if (updated.customerId) {
      await notify(
        confirmed
          ? {
              userId: updated.customerId,
              category: 'payments',
              type: 'payment',
              title: 'Payment confirmed',
              message: `The kitchen confirmed your payment for order #${updated.orderNumber}.`,
              actionUrl: `/orders/${orderId}`,
              data: { orderId },
              channels: ['push'],
            }
          : {
              userId: updated.customerId,
              category: 'payments',
              type: 'payment',
              title: "The kitchen couldn't find your payment",
              message: `For order #${updated.orderNumber}: "${disputeReason || 'Payment not received'}". Check the transfer and send the receipt again, or contact support.`,
              actionUrl: `/orders/${orderId}`,
              data: { orderId },
              channels: ['push', 'email', 'sms'],
            }
      );
    }

    return {
      success: true,
      orderId: updated.id,
      paymentStatus: updated.paymentStatus,
      confirmed,
    };
  }

  /**
   * An admin settles a transfer the kitchen disputed (or hasn't confirmed yet) after checking
   * the receipt with both sides: the money is in the kitchen's account after all. The order
   * is then paid, with the money held by the kitchen.
   */
  async adminConfirmManualPayment(orderId: string, adminId: string, note?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderStatus: true, paymentMethod: true } });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (['cancelled', 'refunded'].includes(order.orderStatus) || !SELLER_DIRECT_METHODS.includes(order.paymentMethod)) {
      throw new AppError('This order has no transfer to confirm', 400, 'NOT_MANUAL_PAYMENT');
    }
    const now = new Date();
    // Only from a reported transfer: never over a refund or an already settled payment.
    const applied = await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ['payment_submitted', 'disputed'] } },
      data: {
        paymentStatus: 'paid',
        paymentCollectedBy: 'seller',
        paymentConfirmedBy: 'admin',
        paymentConfirmedAt: now,
        paidAt: now,
        paymentDisputeReason: null,
      },
    });
    if (applied.count === 0) {
      throw new AppError('Only a transfer the customer reported (and the kitchen confirmed or disputed) can be confirmed', 409, 'NO_PAYMENT_SUBMITTED');
    }
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: `Payment confirmed by Nuray support${note?.trim() ? `: ${note.trim()}` : ''}`,
        changedBy: adminId,
      },
    });
    if (['delivered', 'completed'].includes(order.orderStatus)) {
      await ledgerService.recordOrderCompletion(orderId).catch((err) => console.error(`Ledger posting failed for order ${orderId}:`, err));
    }
    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, adminId);
    const settled = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, customerId: true } });
    if (settled?.customerId) {
      await notify({
        userId: settled.customerId,
        category: 'payments',
        type: 'payment',
        title: 'Payment confirmed',
        message: `Nuray support confirmed your payment for order #${settled.orderNumber}.`,
        actionUrl: `/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }
    const payee = await payeeSellerUserId(orderId);
    if (payee && settled) {
      await notify({
        userId: payee,
        category: 'payments',
        type: 'payment',
        title: `Payment confirmed: order #${settled.orderNumber}`,
        message: `Nuray support checked the transfer for order #${settled.orderNumber}: it reached your account, so the order is paid.`,
        actionUrl: `/sellers/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }
    return { orderId, paymentStatus: 'paid' };
  }

  /**
   * In-App Order Messages (Buyer ↔ Seller / Rider)
   */
  async getOrderMessages(orderId: string, userId: string, role?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'ORDER_NOT_FOUND');
    }

    // Mark unread messages sent by the counterparty as read (Double Blue Tick)
    // Always "messages from someone else". (A client-supplied ?role= used to
    // steer this, letting a caller mark the other side's messages unread/read.)
    void role;
    const readCondition = { senderId: { not: userId } };

    const markedRead = await prisma.orderMessage.updateMany({
      where: {
        orderId,
        ...readCondition,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    if (markedRead.count > 0) void realtimeOrderService.emitMessagesRead(orderId, userId);

    const messages = await prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return Promise.all(messages.map(async (m) => ({
      id: m.id,
      orderId: m.orderId,
      senderId: m.senderId,
      senderRole: m.senderRole,
      senderName: m.sender.profile?.fullName || m.sender.userType,
      senderAvatar: m.sender.profile?.avatarUrl || null,
      message: m.message,
      messageType: m.messageType || 'text',
      mediaUrl: await presentFile(m.mediaUrl),
      duration: m.duration || null,
      isRead: m.isRead,
      readAt: m.readAt,
      createdAt: m.createdAt,
      isMe: m.senderId === userId,
    })));
  }

  /**
   * Send In-App Order Message (with Voice Notes, Media, & Role Context)
   */
  async sendOrderMessage(
    orderId: string,
    userId: string,
    message: string,
    options?: {
      role?: 'customer' | 'seller' | 'rider';
      messageType?: 'text' | 'voice' | 'image';
      mediaUrl?: string;
      duration?: number;
    }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
      include: {
        items: {
          select: { sellerId: true, seller: { select: { userId: true } } },
        },
        delivery: { select: { rider: { select: { userId: true } } } },
      },
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'ORDER_NOT_FOUND');
    }

    // The sender's role comes from their actual relationship to this order, never
    // from the request: a client-supplied role let a customer post as the seller
    // or rider. A caller who genuinely holds several roles (e.g. a seller ordering
    // from their own shop) may pick among those they hold.
    const heldRoles: string[] = [];
    if (order.customerId === userId) heldRoles.push('customer');
    if (seller && order.items.some((i) => i.sellerId === seller.id || i.seller?.userId === userId)) heldRoles.push('seller');
    if (order.delivery?.rider?.userId === userId) heldRoles.push('rider');
    if (isAdmin) heldRoles.push('support');
    const effectiveRole =
      options?.role && heldRoles.includes(options.role) ? options.role : heldRoles[0] ?? 'customer';

    const msgType = options?.messageType || 'text';
    const fallbackMessage = msgType === 'voice' ? '🎙️ Voice note' : (message?.trim() || '');

    const orderMsg = await prisma.orderMessage.create({
      data: {
        orderId,
        senderId: userId,
        senderRole: effectiveRole,
        message: fallbackMessage,
        messageType: msgType,
        mediaUrl: options?.mediaUrl || null,
        duration: options?.duration ? Math.round(options.duration) : null,
        isRead: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    void realtimeOrderService.emitOrderMessage(orderId, orderMsg.id, userId, effectiveRole);

    return {
      id: orderMsg.id,
      orderId: orderMsg.orderId,
      senderId: orderMsg.senderId,
      senderRole: orderMsg.senderRole,
      senderName: orderMsg.sender.profile?.fullName || orderMsg.sender.userType,
      senderAvatar: orderMsg.sender.profile?.avatarUrl || null,
      message: orderMsg.message,
      messageType: orderMsg.messageType,
      mediaUrl: await presentFile(orderMsg.mediaUrl),
      duration: orderMsg.duration,
      isRead: orderMsg.isRead,
      readAt: orderMsg.readAt,
      createdAt: orderMsg.createdAt,
      isMe: true,
    };
  }
}

export default new OrderService();
