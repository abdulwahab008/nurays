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
    status: string
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
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
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
      // for orders with no rider assigned (e.g. self-delivery).
      dispatched: ['in_transit', 'delivered'],
      in_transit: ['delivered'],
      delivered: [],
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

      if (allReady && currentOrderStatus === 'confirmed') {
        derivedOrderStatus = 'ready';
        historyNote = 'All items ready for dispatch';
      } else if (allPreparing && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'preparing';
        historyNote = 'Order preparation started';
      } else if (status === 'confirmed' && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'confirmed';
        historyNote = 'Order confirmed by seller';
      }

      if (derivedOrderStatus) {
        // Guard the write on the order still being in the exact state we
        // derived from — if a concurrent transaction on another item already
        // moved it, this becomes a no-op instead of re-applying/duplicating
        // the same transition.
        const applied = await tx.order.updateMany({
          where: { id: orderItem.orderId, orderStatus: currentOrderStatus },
          data: { orderStatus: derivedOrderStatus },
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
   * Get seller dashboard stats
   */
  async getSellerDashboard(sellerId: string) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get stats
    const [
      totalProducts,
      activeOrders,
      pendingOrders,
      totalEarnings,
      pendingPayout,
      recentOrders,
      lowStockProducts,
    ] = await Promise.all([
      // Total products
      prisma.product.count({
        where: { sellerId: seller.id, isActive: true },
      }),

      // Active orders (confirmed, preparing, ready, dispatched, in_transit)
      prisma.orderItem.count({
        where: {
          sellerId: seller.id,
          order: {
            orderStatus: {
              in: ['confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'],
            },
          },
        },
      }),

      // Pending orders
      prisma.orderItem.count({
        where: {
          sellerId: seller.id,
          order: {
            orderStatus: 'pending',
          },
        },
      }),

      // Total earnings (sum of sellerPayout from completed orders)
      prisma.orderItem.aggregate({
        where: {
          sellerId: seller.id,
          order: {
            orderStatus: 'completed',
            paymentStatus: 'paid',
          },
        },
        _sum: {
          sellerPayout: true,
        },
      }),

      // Pending payout (sum of sellerPayout from paid but not completed orders)
      prisma.orderItem.aggregate({
        where: {
          sellerId: seller.id,
          order: {
            orderStatus: {
              in: ['confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered'],
            },
            paymentStatus: 'paid',
          },
        },
        _sum: {
          sellerPayout: true,
        },
      }),

      // Recent orders (last 10)
      prisma.orderItem.findMany({
        where: { sellerId: seller.id },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStatus: true,
              totalAmount: true,
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
      }),

      // Low stock products (stock < 10)
      prisma.product.findMany({
        where: {
          sellerId: seller.id,
          isActive: true,
          stockQuantity: {
            lt: 10,
          },
        },
        take: 5,
        orderBy: { stockQuantity: 'asc' },
        select: {
          id: true,
          name: true,
          stockQuantity: true,
        },
      }),
    ]);

    return {
      overview: {
        totalProducts,
        activeOrders,
        pendingOrders,
        totalEarnings: Number(totalEarnings._sum.sellerPayout || 0),
        pendingPayout: Number(pendingPayout._sum.sellerPayout || 0),
        rating: Number(seller.ratingAverage),
        totalReviews: seller.totalReviews,
      },
      recentOrders: recentOrders.map((item) => ({
        id: item.order.id,
        orderNumber: item.order.orderNumber,
        orderStatus: item.order.orderStatus,
        productName: item.product?.name,
        quantity: item.quantity,
        totalPrice: Number(item.totalPrice),
        createdAt: item.order.createdAt,
      })),
      lowStockProducts: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        stockQuantity: product.stockQuantity,
      })),
    };
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

