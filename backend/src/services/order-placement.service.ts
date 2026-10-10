import { randomInt } from 'crypto';
import type { Prisma, Seller } from '@prisma/client';
import prisma from '../config/database';
import { getPlatformDeliveryPricing } from './delivery-pricing.service';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { SELLER_COMMUNITY_DELIVERY_SELECT } from '../utils/sellerDeliverySelect';
import { communityService } from './community.service';
import { eligibleSubtotalForPromotion, isItemEligibleForPromotion } from './promotion.service';
import { priceOrder } from '../utils/pricing';
import { codeDiscount, priceLines, shareCodeDiscount, splitDeliveryFees, type KitchenDeliveryFee } from '../utils/orderPricing';
import { allocateHubStock } from './hub-allocation.service';
import { DeliveryFeeShare } from '../utils/deliveryEarnings';
import { getDeliveryFeeForSeller } from '../utils/deliveryFee';
import { assertOnMenu } from '../utils/menu';
import { createStockAlert } from './stock-alert.service';
import promotionService from './promotion.service';
import { isAcceptingOrders, validateOrderTiming } from './availability.service';
import { ONLINE_GATEWAY_METHODS } from '../utils/paymentCustody';
import { onlinePaymentsAvailable } from './online-payment.service';
import { newHandoverCode } from './handover.service';
import { debitWallet } from './wallet.service';
import { logger } from '../utils/logger';

/** Placing an order: the cart's items priced, discounted, split by kitchen and written in one transaction. */
export class OrderPlacement {
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

    // An online-payment order needs a working gateway. Without one it could never be paid and would sit
    // until the stale-order sweep cancelled it, so refuse it now, before anything is reserved or charged.
    if (ONLINE_GATEWAY_METHODS.includes(data.paymentMethod) && !onlinePaymentsAvailable()) {
      throw AppError.expected('Online payment is not available right now. Please pay with cash or your wallet instead.', 503, 'GATEWAY_UNAVAILABLE');
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
      commissionRate: Prisma.Decimal;
      commissionAmount: number;
      sellerPayout: number;
      promoDiscount: number;
      fulfillmentType: string;
      hubId: string | null;
    }> = [];
    const sellersInOrder = new Map<string, Seller>();

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
    const priced = priceLines(orderItems, discountedUnitPrices);
    orderItems.forEach((item, i) => Object.assign(item, priced.lines[i]));
    const subtotal = priced.subtotal;

    // Calculate delivery fee: per-seller (free in their areas, fixed or distance-based outside), then sum
    let deliveryFee: number;
    // What the kitchen pays Nuray for a Nuray rider's delivery (the customer pays no delivery fee for it).
    let sellerDeliveryCharge = 0;
    let deliveryFeeBreakdown: DeliveryFeeShare[] = [];
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
      const kitchenFees: KitchenDeliveryFee[] = [];
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
        kitchenFees.push({ sellerId: seller.id, fee: result.fee, pricedByPlatform: result.pricing != null });
      }
      const split = splitDeliveryFees(kitchenFees);
      deliveryFee = split.deliveryFee;
      sellerDeliveryCharge = split.sellerDeliveryCharge;
      deliveryFeeBreakdown = split.breakdown;
    } else {
      // Every branch above prices the order; reaching here means there is nothing to price.
      throw new AppError('Order has no items', 400, 'NO_ITEMS');
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
            discountAmount = codeDiscount(promotion, eligibleSubtotal);
            promotionId = promotion.id;

            // Record each eligible item's share of the discount (to the cent), so a later partial
            // cancel refunds exactly what the customer paid for that item.
            const eligibleItems = orderItems.filter((i) =>
              isItemEligibleForPromotion(promotion, { productId: i.productId, sellerId: i.sellerId, total: i.totalPrice })
            );
            // A seller's own code is funded by the seller: their share (and the commission on it) is worked
            // out on what the customer actually pays for the item.
            const shares = shareCodeDiscount(eligibleItems, discountAmount, !!promotion.sellerId);
            eligibleItems.forEach((i, idx) => Object.assign(i, shares[idx]));
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
          deliveryFeeBreakdown: deliveryFeeBreakdown as unknown as Prisma.InputJsonValue,
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
              } as Prisma.InputJsonObject)
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
      logger.error({ err, orderId: order.order.id }, 'New-order notification failed');
    }

    // Low-stock / out-of-stock alerts (may send email): in the background, never
    // holding up the customer's checkout.
    void this.raiseStockAlerts(order.updatedProducts).catch((err) =>
      logger.error({ err }, 'Stock alerts after order failed')
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
}

export default new OrderPlacement();
