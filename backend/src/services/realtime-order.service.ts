import prisma from '../config/database';
import socketManager from '../config/socket';
import notificationService from './notification.service';
import { AppError } from '../middleware/errorHandler';

const ORDER_STATUS_MESSAGES: Record<string, { title: string; message: (orderNumber: string) => string }> = {
  confirmed: { title: 'Order confirmed', message: (n) => `Your order #${n} has been confirmed by the seller.` },
  preparing: { title: 'Order being prepared', message: (n) => `Your order #${n} is being prepared.` },
  ready: { title: 'Order ready', message: (n) => `Your order #${n} is ready for dispatch.` },
  dispatched: { title: 'Order dispatched', message: (n) => `Your order #${n} has been dispatched.` },
  in_transit: { title: 'Order on the way', message: (n) => `Your order #${n} is on its way!` },
  delivered: { title: 'Order delivered', message: (n) => `Your order #${n} has been delivered. Enjoy!` },
  delivery_failed: { title: 'Delivery unsuccessful', message: (n) => `We couldn't deliver order #${n}. Our team will reach out shortly.` },
  completed: { title: 'Order completed', message: (n) => `Your order #${n} is complete. Thanks for ordering!` },
  cancelled: { title: 'Order cancelled', message: (n) => `Your order #${n} has been cancelled.` },
  refunded: { title: 'Order refunded', message: (n) => `Your order #${n} has been refunded.` },
};

/**
 * Socket rooms of everyone party to an order: whoever has its page open, the customer, its
 * kitchens and its rider. Each client then reloads what it shows, so payloads stay small and
 * never carry anything a party may not see (signed file links, the handover code).
 */
async function orderAudience(orderId: string): Promise<{ rooms: string[]; customerId: string | null; orderNumber: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      orderNumber: true,
      items: { select: { seller: { select: { userId: true } } } },
      delivery: { select: { rider: { select: { userId: true } } } },
    },
  });
  if (!order) return null;
  const rooms = [`order:${orderId}`];
  if (order.customerId) rooms.push(`user:${order.customerId}`);
  for (const item of order.items) if (item.seller.userId) rooms.push(`user:${item.seller.userId}`);
  if (order.delivery?.rider?.userId) rooms.push(`user:${order.delivery.rider.userId}`);
  return { rooms, customerId: order.customerId, orderNumber: order.orderNumber };
}

export class RealtimeOrderService {
  /**
   * Emit order status update to relevant parties
   */
  async emitOrderStatusUpdate(orderId: string, status: string, changedBy?: string) {
    const audience = await orderAudience(orderId);
    if (!audience) {
      return;
    }

    const orderData = {
      orderId,
      orderNumber: audience.orderNumber,
      status,
      updatedAt: new Date().toISOString(),
      changedBy,
    };

    // The order's room, customer, kitchens, rider and admins, each connection once.
    socketManager.emitToRooms([...audience.rooms, 'role:admin'], 'order:status:update', orderData);

    if (audience.customerId) {
      const statusMessage = ORDER_STATUS_MESSAGES[status];
      if (statusMessage) {
        notificationService
          .createNotification(audience.customerId, {
            type: 'order',
            title: statusMessage.title,
            message: statusMessage.message(audience.orderNumber),
            actionUrl: `/orders/${orderId}`,
            data: { orderId, orderNumber: audience.orderNumber, status },
          })
          .catch((err) => console.error('Failed to create customer notification:', err));
      }
    }
  }

  /**
   * Emit order item status update
   */
  async emitOrderItemStatusUpdate(orderItemId: string, status: string, _sellerId?: string) {
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { id: true, orderId: true },
    });
    if (!orderItem) {
      return;
    }
    const audience = await orderAudience(orderItem.orderId);
    if (!audience) {
      return;
    }

    socketManager.emitToRooms(audience.rooms, 'order:item:status:update', {
      orderItemId: orderItem.id,
      orderId: orderItem.orderId,
      orderNumber: audience.orderNumber,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  // The emitters below are best-effort and never throw: a lost live update is caught up by
  // the client's reload on reconnect, never worth failing the action that caused it.

  /** A new chat message on an order: its parties reload the conversation. */
  async emitOrderMessage(orderId: string, messageId: string, senderId: string, senderRole: string) {
    try {
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'order:message', { orderId, messageId, senderId, senderRole });
    } catch (err) {
      console.error('order:message event failed:', err);
    }
  }

  /** Someone read an order's messages: the senders' read ticks update. */
  async emitMessagesRead(orderId: string, readerId: string) {
    try {
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'order:messages:read', { orderId, readerId });
    } catch (err) {
      console.error('order:messages:read event failed:', err);
    }
  }

  /** A delivery job joined the open pool: riders reload their list of available jobs. */
  emitDeliveryPosted(deliveryId: string, orderId: string) {
    socketManager.emitToRole('rider', 'delivery:new', { deliveryId, orderId });
  }

  /** A rider took a job: it leaves every other rider's list, and the order's parties reload. */
  async emitDeliveryClaimed(deliveryId: string, orderId: string) {
    try {
      socketManager.emitToRole('rider', 'delivery:removed', { deliveryId, orderId, reason: 'claimed' });
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'delivery:assigned', { deliveryId, orderId });
    } catch (err) {
      console.error('delivery:assigned event failed:', err);
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

    // Confirm to the customer that their order was placed
    if (order.customerId) {
      notificationService
        .createNotification(order.customerId, {
          type: 'order',
          title: 'Order placed',
          message: `Your order #${order.orderNumber} (${totalAmountFormatted}) has been placed.`,
          actionUrl: `/orders/${order.id}`,
          data: { orderId: order.id, orderNumber: order.orderNumber },
        })
        .catch((err) => console.error('Failed to create customer order-placed notification:', err));
    }

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

    // The order's room and the customer (who may only have their orders list open), once each.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    socketManager.emitToRooms(
      [`order:${orderId}`, ...(order?.customerId ? [`user:${order.customerId}`] : [])],
      'order:delivery:tracking',
      trackingData
    );
  }
}

export default new RealtimeOrderService();

