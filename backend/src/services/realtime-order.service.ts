import prisma from '../config/database';
import socketManager from '../config/socket';
import { AppError } from '../middleware/errorHandler';
import { notify, notifyMany } from './notify.service';
import type { DeliveryChannel } from '../jobs/notify.jobs';

// What each order status tells the customer, and which channels besides the app it is worth.
const ORDER_STATUS_MESSAGES: Record<
  string,
  { title: string; message: (orderNumber: string, pickup: boolean) => string; channels: (pickup: boolean) => DeliveryChannel[] }
> = {
  confirmed: { title: 'Order confirmed', message: (n) => `The kitchen accepted your order #${n}.`, channels: () => ['push'] },
  preparing: { title: 'Order being prepared', message: (n) => `Your order #${n} is being prepared.`, channels: () => [] },
  ready: {
    title: 'Order ready',
    message: (n, pickup) => (pickup ? `Your order #${n} is ready for you to collect.` : `Your order #${n} is packed and waiting for its rider.`),
    channels: (pickup) => (pickup ? ['push'] : []),
  },
  dispatched: { title: 'Order picked up', message: (n) => `Your order #${n} has left the kitchen.`, channels: () => ['push'] },
  in_transit: { title: 'Order on the way', message: (n) => `Your order #${n} is on its way!`, channels: () => ['push'] },
  delivered: { title: 'Order delivered', message: (n) => `Your order #${n} has been delivered. Enjoy!`, channels: () => ['push', 'email'] },
  delivery_failed: {
    title: 'Delivery unsuccessful',
    message: (n) => `We couldn't deliver order #${n}. Our team will reach out shortly.`,
    channels: () => ['push', 'email', 'sms'],
  },
  completed: { title: 'Order completed', message: (n) => `Your order #${n} is complete. Thanks for ordering!`, channels: () => [] },
  cancelled: { title: 'Order cancelled', message: (n) => `Your order #${n} has been cancelled.`, channels: () => ['push', 'email', 'sms'] },
  refunded: { title: 'Order refunded', message: (n) => `Your order #${n} has been refunded.`, channels: () => ['push', 'email'] },
};

/**
 * Socket rooms of everyone party to an order: whoever has its page open, the customer, its
 * kitchens and its rider. Each client then reloads what it shows, so payloads stay small and
 * never carry anything a party may not see (signed file links, the handover code).
 */
async function orderAudience(
  orderId: string
): Promise<{ rooms: string[]; customerId: string | null; orderNumber: string; deliveryType: string; sellerUserIds: string[] } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      orderNumber: true,
      deliveryType: true,
      items: { select: { seller: { select: { userId: true } } } },
      delivery: { select: { rider: { select: { userId: true } } } },
    },
  });
  if (!order) return null;
  const rooms = [`order:${orderId}`];
  if (order.customerId) rooms.push(`user:${order.customerId}`);
  for (const item of order.items) if (item.seller.userId) rooms.push(`user:${item.seller.userId}`);
  if (order.delivery?.rider?.userId) rooms.push(`user:${order.delivery.rider.userId}`);
  const sellerUserIds = [...new Set(order.items.map((i) => i.seller.userId).filter(Boolean))];
  return { rooms, customerId: order.customerId, orderNumber: order.orderNumber, deliveryType: order.deliveryType, sellerUserIds };
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

    // The customer hears about each status once (this also runs when only the payment changed).
    const statusMessage = ORDER_STATUS_MESSAGES[status];
    if (audience.customerId && statusMessage) {
      const pickup = audience.deliveryType !== 'home_delivery';
      await notify({
        userId: audience.customerId,
        category: 'orders',
        type: 'order',
        title: statusMessage.title,
        message: statusMessage.message(audience.orderNumber, pickup),
        actionUrl: `/orders/${orderId}`,
        data: { orderId, orderNumber: audience.orderNumber, status },
        // A change the customer made themselves (cancelling) needs no alert.
        channels: changedBy === audience.customerId ? [] : statusMessage.channels(pickup),
        dedupeKey: `order:${orderId}:${status}:customer`,
      });
    }

    // Kitchens hear about a cancellation they didn't make themselves.
    if (status === 'cancelled') {
      const by = changedBy === audience.customerId ? 'the customer' : changedBy === 'system' ? 'automatically' : 'Nuray support';
      await notifyMany(
        audience.sellerUserIds.filter((id) => id !== changedBy),
        (sellerUserId) => ({
          category: 'orders',
          type: 'order',
          title: `Order #${audience.orderNumber} cancelled`,
          message: by === 'automatically' ? `Order #${audience.orderNumber} was cancelled automatically. Don't prepare it.` : `Order #${audience.orderNumber} was cancelled by ${by}. Don't prepare it.`,
          actionUrl: `/sellers/orders/${orderId}`,
          data: { orderId, orderNumber: audience.orderNumber, status },
          channels: ['push', 'email'],
          dedupeKey: `order:${orderId}:cancelled:${sellerUserId}`,
        })
      );
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

    // Confirm to the customer that their order was placed (by email too, as a record).
    if (order.customerId) {
      await notify({
        userId: order.customerId,
        category: 'orders',
        type: 'order',
        title: 'Order placed',
        message: `Your order #${order.orderNumber} (${totalAmountFormatted}) has been placed.`,
        actionUrl: `/orders/${order.id}`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
        channels: ['email'],
        dedupeKey: `order:${order.id}:placed`,
      });
    }

    // An order waiting for its online payment is only worth an alert once it is paid
    // (see online-payment.service): a kitchen shouldn't start on an unpaid order.
    const awaitingOnlinePayment = ['safepay', 'card'].includes(order.paymentMethod) && order.paymentStatus !== 'paid';

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
    });
    for (const sellerUserId of sellerOrders.keys()) {
      await notify({
        userId: sellerUserId,
        category: 'orders',
        type: 'order',
        title: awaitingOnlinePayment ? 'New order (awaiting payment)' : 'New order received',
        message: awaitingOnlinePayment
          ? `Order #${order.orderNumber} (${totalAmountFormatted}) is waiting for the customer's online payment. Don't start it yet.`
          : `New order #${order.orderNumber}: ${totalAmountFormatted}. Please accept it within 30 minutes.`,
        actionUrl: `/sellers/orders/${order.id}`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
        // A kitchen must act fast on a new order: push, email and a text message.
        channels: awaitingOnlinePayment ? [] : ['push', 'email', 'sms'],
        dedupeKey: `order:${order.id}:new:${sellerUserId}`,
      });
    }

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

