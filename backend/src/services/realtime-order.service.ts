import prisma from '../config/database';
import socketManager from '../config/socket';
import notificationService from './notification.service';
import { AppError } from '../middleware/errorHandler';

export class RealtimeOrderService {
  /**
   * Emit order status update to relevant parties
   */
  async emitOrderStatusUpdate(orderId: string, status: string, changedBy?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
          },
        },
        items: {
          include: {
            seller: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return;
    }

    const orderData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status,
      updatedAt: new Date().toISOString(),
      changedBy,
    };

    // Emit to order room (all users tracking this order)
    socketManager.emitToOrder(orderId, 'order:status:update', orderData);

    // Emit to customer
    if (order.customerId) {
      socketManager.emitToUser(order.customerId, 'order:status:update', orderData);
    }

    // Emit to all sellers in this order
    const sellerUserIds = new Set(
      order.items.map((item) => item.seller.userId).filter((id): id is string => !!id)
    );
    sellerUserIds.forEach((sellerUserId) => {
      socketManager.emitToUser(sellerUserId, 'order:status:update', orderData);
    });

    // Emit to admins
    socketManager.emitToRole('admin', 'order:status:update', orderData);
  }

  /**
   * Emit order item status update
   */
  async emitOrderItemStatusUpdate(orderItemId: string, status: string, sellerId: string) {
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          include: {
            customer: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!orderItem) {
      return;
    }

    const itemData = {
      orderItemId: orderItem.id,
      orderId: orderItem.orderId,
      orderNumber: orderItem.order.orderNumber,
      status,
      updatedAt: new Date().toISOString(),
    };

    // Emit to order room
    socketManager.emitToOrder(orderItem.orderId, 'order:item:status:update', itemData);

    // Emit to customer
    if (orderItem.order.customerId) {
      socketManager.emitToUser(orderItem.order.customerId, 'order:item:status:update', itemData);
    }

    // Emit to seller
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });

    if (seller?.userId) {
      socketManager.emitToUser(seller.userId, 'order:item:status:update', itemData);
    }
  }

  /**
   * Emit new order notification to sellers
   */
  async emitNewOrderNotification(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            seller: {
              select: {
                userId: true,
                businessName: true,
              },
            },
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return;
    }

    // Group items by seller
    const sellerOrders = new Map<string, any[]>();
    order.items.forEach((item) => {
      if (item.seller.userId) {
        if (!sellerOrders.has(item.seller.userId)) {
          sellerOrders.set(item.seller.userId, []);
        }
        sellerOrders.get(item.seller.userId)!.push({
          productName: item.product?.name || item.productName,
          quantity: item.quantity,
          totalPrice: Number(item.totalPrice),
        });
      }
    });

    const totalAmountFormatted = `Rs ${Number(order.totalAmount).toLocaleString()}`;

    // Emit to each seller and create a persistent notification for the Notifications page
    sellerOrders.forEach((items, sellerUserId) => {
      const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: Number(order.totalAmount),
        items,
        createdAt: order.createdAt.toISOString(),
      };

      socketManager.emitToUser(sellerUserId, 'order:new', payload);

      notificationService
        .createNotification(sellerUserId, {
          type: 'order',
          title: 'New order received',
          message: `New order #${order.orderNumber} — ${totalAmountFormatted}. Please confirm within 30 minutes.`,
          actionUrl: `/sellers/orders/${order.id}`,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        })
        .catch((err) => console.error('Failed to create seller notification:', err));
    });

    // Emit to admins
    socketManager.emitToRole('admin', 'order:new', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      customerId: order.customerId,
      createdAt: order.createdAt.toISOString(),
    });
  }

  /**
   * Get real-time order tracking data
   */
  async getOrderTracking(orderId: string, userId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
          },
        },
        items: {
          include: {
            seller: {
              select: {
                userId: true,
              },
            },
          },
        },
        delivery: {
          include: {
            rider: {
              select: {
                id: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check access: customer, seller, or admin
    const isCustomer = order.customerId === userId;
    const isSeller = order.items.some((item) => item.seller.userId === userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    const isAdmin = user?.userType === 'admin';

    if (!isCustomer && !isSeller && !isAdmin) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      deliveredAt: order.deliveredAt,
      statusHistory: order.statusHistory.map((history) => ({
        status: history.status,
        notes: history.notes,
        changedBy: history.changedBy,
        createdAt: history.createdAt,
      })),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        status: item.status,
      })),
      delivery: order.delivery
        ? {
            status: order.delivery.status,
            estimatedArrival: order.delivery.deliveryTime,
            distanceKm: order.delivery.distanceKm ? Number(order.delivery.distanceKm) : null,
            estimatedDurationMinutes: order.delivery.estimatedDurationMinutes,
          }
        : null,
    };
  }

  /**
   * Emit delivery tracking update
   */
  async emitDeliveryTrackingUpdate(
    orderId: string,
    location: { latitude: number; longitude: number },
    distanceKm?: number,
    estimatedArrival?: Date
  ) {
    const trackingData = {
      orderId,
      location,
      distanceKm,
      estimatedArrival: estimatedArrival?.toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Emit to order room
    socketManager.emitToOrder(orderId, 'order:delivery:tracking', trackingData);

    // Emit to customer
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });

    if (order?.customerId) {
      socketManager.emitToUser(order.customerId, 'order:delivery:tracking', trackingData);
    }
  }
}

export default new RealtimeOrderService();

