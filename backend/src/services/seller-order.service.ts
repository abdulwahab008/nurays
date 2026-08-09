import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import riderService from './rider.service';

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
            totalAmount: true,
            createdAt: true,
            estimatedDeliveryAt: true,
          },
        },
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
            totalAmount: Number(item.order.totalAmount),
            createdAt: item.order.createdAt,
            estimatedDeliveryAt: item.order.estimatedDeliveryAt,
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
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['dispatched', 'cancelled'],
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
      if (result.derivedOrderStatus === 'ready') {
        await riderService.ensureDeliveryForOrder(orderItem.orderId);
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
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'cancelled' },
      });

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

      if (allCancelled) {
        await tx.order.update({
          where: { id: orderItem.orderId },
          data: { orderStatus: 'cancelled' },
        });
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
}

export default new SellerOrderService();

