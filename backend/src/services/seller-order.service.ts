import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import riderService from './rider.service';
import { releasePromotionUsage } from './promotion.service';
import { refundForCancelledItems } from './refund.service';

export class SellerOrderService {
  /**
   * Get seller orders
   */
  async getSellerOrders(
    sellerId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      orderStatus?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause for order items
    const where: any = {
      sellerId: seller.id,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    // Build order where clause
    const orderWhere: any = {};
    if (filters.orderStatus) {
      orderWhere.orderStatus = filters.orderStatus;
    }
    if (filters.dateFrom || filters.dateTo) {
      orderWhere.createdAt = {};
      if (filters.dateFrom) orderWhere.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) orderWhere.createdAt.lte = new Date(filters.dateTo);
    }

    // Get order items with orders
    const orderItems = await prisma.orderItem.findMany({
      where: {
        ...where,
        ...(Object.keys(orderWhere).length > 0
          ? {
              order: orderWhere,
            }
          : {}),
      },
      skip,
      take: limit,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            createdAt: true,
            estimatedDeliveryAt: true,
            deliveryInstructions: true,
            notes: true,
            cancellationReason: true,
            paymentReferenceNumber: true,
            paymentSenderName: true,
            paymentSenderAccount: true,
            paymentProofUrl: true,
            paymentNotes: true,
            paymentSubmittedAt: true,
            deliveryAddress: {
              select: {
                area: true,
                city: true,
                addressLine1: true,
                label: true,
              },
            },
            customer: {
              select: {
                phone: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            preparationTime: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group by order
    const orderMap = new Map();
    orderItems.forEach((item) => {
      if (!item.order) return;

      const orderId = item.order.id;
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          order: {
            id: item.order.id,
            orderNumber: item.order.orderNumber,
            orderStatus: item.order.orderStatus,
            paymentStatus: item.order.paymentStatus,
            paymentMethod: item.order.paymentMethod,
            totalAmount: Number(item.order.totalAmount),
            createdAt: item.order.createdAt,
            estimatedDeliveryAt: item.order.estimatedDeliveryAt,
            deliveryInstructions: item.order.deliveryInstructions,
            notes: item.order.notes,
            cancellationReason: item.order.cancellationReason,
            paymentReferenceNumber: item.order.paymentReferenceNumber,
            paymentSenderName: item.order.paymentSenderName,
            paymentSenderAccount: item.order.paymentSenderAccount,
            paymentProofUrl: item.order.paymentProofUrl,
            paymentNotes: item.order.paymentNotes,
            paymentSubmittedAt: item.order.paymentSubmittedAt,
            customerName: item.order.customer?.profile?.fullName || 'Customer',
            customerPhone: item.order.customer?.phone,
            deliveryAddress: item.order.deliveryAddress,
          },
          items: [],
        });
      }

      orderMap.get(orderId).items.push({
        id: item.id,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              slug: item.product.slug,
              preparationTime: item.product.preparationTime ?? 20,
              image: item.product.images[0]?.imageUrl || null,
            }
          : null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        status: item.status,
        fulfillmentType: item.fulfillmentType,
      });
    });

    const orders = Array.from(orderMap.values());

    // Get total count
    const totalWhere: any = { ...where };
    if (Object.keys(orderWhere).length > 0) {
      totalWhere.order = orderWhere;
    }
    const total = await prisma.orderItem.count({
      where: totalWhere,
    });

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get seller order details
   */
  async getSellerOrderDetails(orderId: string, sellerId: string) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order with items for this seller
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
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
          },
        },
        customer: {
          select: {
            id: true,
            phone: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
        deliveryAddress: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.items.length === 0) {
      throw new AppError('No items found for this seller in this order', 404, 'NO_ITEMS_FOUND');
    }

    // Calculate seller totals
    const sellerSubtotal = order.items.reduce(
      (sum, item) => sum + Number(item.totalPrice),
      0
    );
    const sellerCommission = order.items.reduce(
      (sum, item) => sum + Number(item.commissionAmount),
      0
    );
    const sellerPayout = order.items.reduce(
      (sum, item) => sum + Number(item.sellerPayout),
      0
    );

    return {
      ...order,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
      sellerTotals: {
        subtotal: sellerSubtotal,
        commission: sellerCommission,
        payout: sellerPayout,
      },
    };
  }

  /**
   * Update order item status
   */
  async updateOrderItemStatus(
    orderItemId: string,
    sellerId: string,
    status: string,
    reason?: string
  ) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order item
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        sellerId: seller.id,
      },
      include: {
        order: true,
      },
    });

    if (!orderItem) {
      throw new AppError('Order item not found or access denied', 404, 'ORDER_ITEM_NOT_FOUND');
    }

    // Validate status transition
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'delivery_failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
    }

    // Order items move forward through this pipeline only (or cancel before dispatch) —
    // no skipping stages, no moving backward.
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      // Cancelling is deliberately absent: it must restock inventory and keep the
      // parent order consistent, which only cancelOrderItem / rejectOrder do.
      pending: ['confirmed'],
      confirmed: ['preparing'],
      preparing: ['ready'],
      ready: ['dispatched'],
      // A rider (rider.service.ts) normally drives dispatched -> in_transit ->
      // delivered directly, but a seller must still be able to do this by hand
      // for orders with no rider assigned (e.g. self-delivery). A seller who
      // can't complete the delivery reports delivery_failed the same way a
      // rider does; admin resolves it (refund or retry) from there.
      dispatched: ['in_transit', 'delivered', 'delivery_failed'],
      in_transit: ['delivered', 'delivery_failed'],
      delivered: [],
      delivery_failed: [],
      cancelled: [],
    };
    if (!ALLOWED_TRANSITIONS[orderItem.status]?.includes(status)) {
      throw new AppError(
        `Cannot move an item from "${orderItem.status}" to "${status}"`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // All DB writes happen inside a single transaction so partial failures
    // can't split item.status and order.orderStatus.
    const result = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status },
      });

      const allItems = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
      });

      // Re-read the order's status inside the transaction — the copy fetched
      // before the transaction started can be stale if another concurrent
      // update on a sibling item already changed it.
      const currentOrder = await tx.order.findUnique({
        where: { id: orderItem.orderId },
        select: { orderStatus: true },
      });
      const currentOrderStatus = currentOrder?.orderStatus;

      let derivedOrderStatus: string | null = null;
      let historyNote = '';

      const allReady = allItems.every((i) => i.status === 'ready');
      const allPreparing = allItems.every((i) => i.status === 'preparing');

      const allDelivered = allItems.every((i) => i.status === 'delivered' || i.status === 'cancelled');
      const anyFailed = allItems.some((i) => i.status === 'delivery_failed');

      if (allReady && currentOrderStatus === 'confirmed') {
        derivedOrderStatus = 'ready';
        historyNote = 'All items ready for dispatch';
      } else if (allPreparing && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'preparing';
        historyNote = 'Order preparation started';
      } else if (status === 'confirmed' && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'confirmed';
        historyNote = 'Order confirmed by seller';
      } else if (status === 'delivery_failed' && anyFailed && currentOrderStatus !== 'delivery_failed') {
        derivedOrderStatus = 'delivery_failed';
        historyNote = `Seller reported a failed self-delivery: ${reason}`;
      } else if (status === 'delivered' && allDelivered && currentOrderStatus !== 'delivered') {
        derivedOrderStatus = 'delivered';
        historyNote = 'Self-delivered by seller';
      }

      if (derivedOrderStatus) {
        // COD payment is collected at the door — delivered IS the payment
        // confirmation for COD (online payments are already 'paid' via the
        // gateway verification flow well before delivery).
        const isCodPayment =
          derivedOrderStatus === 'delivered' &&
          orderItem.order.paymentMethod === 'cod' &&
          orderItem.order.paymentStatus !== 'paid';

        // Guard the write on the order still being in the exact state we
        // derived from — if a concurrent transaction on another item already
        // moved it, this becomes a no-op instead of re-applying/duplicating
        // the same transition.
        const applied = await tx.order.updateMany({
          where: { id: orderItem.orderId, orderStatus: currentOrderStatus },
          data: {
            orderStatus: derivedOrderStatus,
            ...(derivedOrderStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
            ...(isCodPayment ? { paymentStatus: 'paid', paidAt: new Date() } : {}),
          },
        });
        if (applied.count > 0) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: orderItem.orderId,
              status: derivedOrderStatus,
              notes: historyNote,
              changedBy: sellerId,
            },
          });
        } else {
          derivedOrderStatus = null;
        }
      }

      return { updatedItem, derivedOrderStatus };
    });

    // Emit real-time events only after the transaction commits.
    if (result.derivedOrderStatus) {
      await realtimeOrderService.emitOrderStatusUpdate(
        orderItem.orderId,
        result.derivedOrderStatus,
        sellerId,
      );
      // Predictive JIT lookahead dispatch:
      // Post delivery jobs into the rider network when cooking starts ('confirmed' / 'preparing'),
      // so riders travel to the kitchen in parallel and arrive just as food is ready.
      if (['confirmed', 'preparing', 'ready'].includes(result.derivedOrderStatus)) {
        const prepMins = seller.minPrepTimeMinutes ?? 25;
        await riderService.ensureDeliveryForOrder(orderItem.orderId, prepMins);
      }
    }
    await realtimeOrderService.emitOrderItemStatusUpdate(orderItemId, status, seller.id);

    return result.updatedItem;
  }

  /**
   * Cancel order item (seller can cancel their items)
   */
  async cancelOrderItem(orderItemId: string, sellerId: string, _reason: string) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order item
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        sellerId: seller.id,
      },
      include: {
        order: true,
        product: true,
      },
    });

    if (!orderItem) {
      throw new AppError('Order item not found or access denied', 404, 'ORDER_ITEM_NOT_FOUND');
    }

    // Check if can be cancelled
    const cancellableStatuses = ['pending', 'confirmed', 'preparing'];
    if (!cancellableStatuses.includes(orderItem.status)) {
      throw new AppError(
        `Order item cannot be cancelled. Current status: ${orderItem.status}`,
        400,
        'ORDER_ITEM_NOT_CANCELLABLE'
      );
    }

    // All writes + the "are all items cancelled now?" check happen inside a
    // single transaction so we can't observe an intermediate state where one
    // item is cancelled but the parent order isn't yet.
    const result = await prisma.$transaction(async (tx) => {
      // Guarded on the item still being cancellable: two concurrent cancels (or a
      // cancel racing a status change) must not both restock the same item.
      const claimed = await tx.orderItem.updateMany({
        where: { id: orderItemId, status: { in: cancellableStatuses } },
        data: { status: 'cancelled' },
      });
      if (claimed.count === 0) {
        throw new AppError('Order item can no longer be cancelled', 409, 'ORDER_ITEM_NOT_CANCELLABLE');
      }
      const updatedItem = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });

      // A variant item drew from its own stock pool at order time (see
      // order.service.ts createOrder), so restore it there, not on the
      // shared product-level stock it never touched.
      if (orderItem.variantId) {
        await tx.productVariant.update({
          where: { id: orderItem.variantId },
          data: { stockQuantity: { increment: orderItem.quantity } },
        });
      }
      if (orderItem.productId) {
        await tx.product.update({
          where: { id: orderItem.productId },
          data: {
            ...(orderItem.variantId ? {} : { stockQuantity: { increment: orderItem.quantity } }),
            totalOrders: { decrement: 1 },
          },
        });
        await tx.inventoryReservation.deleteMany({
          where: {
            productId: orderItem.productId,
            reservationType: 'order',
            reservationId: orderItem.orderId,
          },
        });
      }

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { status: true },
      });
      const allCancelled = remaining.every((i) => i.status === 'cancelled');

      // The customer paid for this item: refund its share (or everything left if
      // this was the last live item and the whole order is now cancelled).
      await refundForCancelledItems(tx, orderItem.orderId, [orderItemId], {
        reason: `Item cancelled by seller (${orderItem.productName})`,
        createdBy: sellerId,
        orderFullyCancelled: allCancelled,
      });

      if (allCancelled) {
        await tx.order.update({
          where: { id: orderItem.orderId },
          data: { orderStatus: 'cancelled' },
        });
        await releasePromotionUsage(tx, orderItem.orderId);
        await tx.orderStatusHistory.create({
          data: {
            orderId: orderItem.orderId,
            status: 'cancelled',
            notes: 'All items cancelled by seller',
            changedBy: sellerId,
          },
        });
      }

      return { updatedItem, allCancelled };
    });

    if (result.allCancelled) {
      await realtimeOrderService.emitOrderStatusUpdate(orderItem.orderId, 'cancelled', sellerId);
    }
    await realtimeOrderService.emitOrderItemStatusUpdate(orderItemId, 'cancelled', seller.id);

    return {
      orderItemId: result.updatedItem.id,
      status: result.updatedItem.status,
      message: 'Order item cancelled successfully',
    };
  }

  /**
   * Accept an entire order (Section 7: Order Placed -> Accepted -> Preparing)
   */
  async acceptOrder(orderId: string, sellerUserId: string) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
          include: { product: true },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    // If order was already accepted or ready, return gracefully
    if (['preparing', 'ready'].includes(order.orderStatus)) {
      return {
        orderId: order.id,
        orderStatus: order.orderStatus,
        message: `Order is already ${order.orderStatus}`,
      };
    }

    if (!['pending', 'confirmed'].includes(order.orderStatus)) {
      throw new AppError(`Cannot accept order with status: ${order.orderStatus}`, 400, 'INVALID_STATUS');
    }

    // Determine prep time from items or seller default
    const prepTimes = order.items.map((i) => i.product?.preparationTime || seller.minPrepTimeMinutes || 20);
    const maxPrepMinutes = Math.max(...prepTimes, 15);
    const estimatedReadyAt = new Date(Date.now() + maxPrepMinutes * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Claim the transition first. The status check above ran before this
      // transaction, so a customer cancelling at the same instant must not be
      // overwritten (that revived a cancelled order whose stock was returned).
      const claimed = await tx.order.updateMany({
        where: { id: order.id, orderStatus: { in: ['pending', 'confirmed'] } },
        data: {
          orderStatus: 'preparing',
          estimatedDeliveryAt: estimatedReadyAt,
        },
      });
      if (claimed.count === 0) {
        throw new AppError('Order status changed; it can no longer be accepted', 409, 'ORDER_STATUS_CONFLICT');
      }

      // Advance this seller's live items to preparing (never revive cancelled ones)
      await tx.orderItem.updateMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'preparing' },
      });
      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'preparing',
          notes: `Order accepted by kitchen. Estimated preparation time: ${maxPrepMinutes} min.`,
          changedBy: sellerUserId,
        },
      });

      return updatedOrder;
    });

    // JIT rider dispatch lookahead
    try {
      await riderService.ensureDeliveryForOrder(order.id, maxPrepMinutes);
    } catch (err) {
      console.warn('Rider dispatch warning during acceptOrder:', err);
    }

    await realtimeOrderService.emitOrderStatusUpdate(order.id, 'preparing', sellerUserId);

    return {
      orderId: result.id,
      orderStatus: result.orderStatus,
      estimatedReadyAt,
      preparationMinutes: maxPrepMinutes,
      message: 'Order accepted and kitchen preparation started',
    };
  }

  /**
   * Reject an entire order (Section 7: Seller selects reason, restocks, customer notified)
   */
  async rejectOrder(orderId: string, sellerUserId: string, reason: string) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
          include: { product: true },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    // Allow reject/cancel before actual rider pickup / in-transit delivery
    if (!['pending', 'confirmed', 'preparing', 'ready'].includes(order.orderStatus)) {
      throw new AppError(`Cannot reject order with status: ${order.orderStatus}. Only orders before rider dispatch can be declined.`, 400, 'INVALID_STATUS');
    }

    const rejectionNote = reason?.trim() || 'Kitchen unavailable';

    const fullyCancelled = await prisma.$transaction(async (tx) => {
      // Only this seller's still-live items are rejected and restocked — items
      // already cancelled were restocked when that happened. Read before the update.
      const liveItems = await tx.orderItem.findMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
      });
      if (liveItems.length === 0) {
        throw new AppError('There is nothing left to reject on this order', 409, 'ORDER_STATUS_CONFLICT');
      }

      // Guard against a concurrent cancel/accept: the status check above ran
      // outside this transaction.
      const stillRejectable = await tx.order.count({
        where: { id: order.id, orderStatus: { in: ['pending', 'confirmed', 'preparing', 'ready'] } },
      });
      if (stillRejectable === 0) {
        throw new AppError('Order status changed; it can no longer be rejected', 409, 'ORDER_STATUS_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { id: { in: liveItems.map((i) => i.id) } },
        data: { status: 'cancelled' },
      });

      // Restock products
      for (const item of liveItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
              totalOrders: { decrement: 1 },
            },
          });
          await tx.inventoryReservation.deleteMany({
            where: {
              productId: item.productId,
              reservationType: 'order',
              reservationId: order.id,
            },
          });
        }
      }

      // In a multi-seller order, one kitchen rejecting its items must not cancel
      // the other kitchens' items: the order is cancelled only once nothing is left.
      const stillLive = await tx.orderItem.count({
        where: { orderId: order.id, status: { notIn: ['cancelled'] } },
      });
      const allGone = stillLive === 0;

      if (allGone) {
        await tx.order.updateMany({
          where: { id: order.id, orderStatus: { in: ['pending', 'confirmed', 'preparing', 'ready'] } },
          data: {
            orderStatus: 'cancelled',
            cancellationReason: `Rejected by kitchen: ${rejectionNote}`,
            cancelledBy: 'seller',
          },
        });
        await releasePromotionUsage(tx, order.id);
      }

      // The customer paid for these items: give it back (their share if other
      // kitchens' items remain, everything if the whole order is now cancelled).
      await refundForCancelledItems(tx, order.id, liveItems.map((i) => i.id), {
        reason: `Rejected by ${seller.businessName}: ${rejectionNote}`,
        createdBy: sellerUserId,
        orderFullyCancelled: allGone,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: allGone ? 'cancelled' : order.orderStatus,
          notes: allGone
            ? `Order rejected by kitchen: ${rejectionNote}`
            : `${seller.businessName} rejected its items: ${rejectionNote}`,
          changedBy: sellerUserId,
        },
      });

      return allGone;
    });

    if (fullyCancelled) {
      await realtimeOrderService.emitOrderStatusUpdate(order.id, 'cancelled', sellerUserId);
    }

    return {
      orderId: order.id,
      orderStatus: fullyCancelled ? 'cancelled' : order.orderStatus,
      reason: rejectionNote,
      message: fullyCancelled
        ? 'Order rejected successfully and customer notified'
        : 'Your items were rejected; the other kitchens on this order are unaffected',
    };
  }

  /**
   * Mark food ready for pickup (Section 10: Preparing -> Ready for Pickup)
   */
  async markOrderReady(orderId: string, sellerUserId: string) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    if (order.orderStatus === 'ready') {
      return {
        orderId: order.id,
        orderStatus: 'ready',
        message: 'Order is already marked ready for pickup',
      };
    }

    if (!['confirmed', 'preparing'].includes(order.orderStatus)) {
      throw new AppError(`Cannot mark ready an order with status: ${order.orderStatus}`, 400, 'INVALID_STATUS');
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, orderStatus: { in: ['confirmed', 'preparing'] } },
        data: { orderStatus: 'ready' },
      });
      if (claimed.count === 0) {
        throw new AppError('Order status changed; it can no longer be marked ready', 409, 'ORDER_STATUS_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'ready' },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'ready',
          notes: 'Food is prepared and ready for pickup by delivery rider.',
          changedBy: sellerUserId,
        },
      });
    });

    await realtimeOrderService.emitOrderStatusUpdate(order.id, 'ready', sellerUserId);

    return {
      orderId: order.id,
      orderStatus: 'ready',
      message: 'Order is ready for pickup. Rider alerted.',
    };
  }
}

export default new SellerOrderService();

