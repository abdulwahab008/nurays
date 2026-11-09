import prisma from '../config/database';
import socketManager, { ON_DUTY_RIDERS_ROOM } from '../config/socket';
import { AppError } from '../middleware/errorHandler';
import { notify, notifyMany } from './notify.service';
import type { DeliveryChannel } from '../jobs/notify.jobs';
import { ONLINE_GATEWAY_METHODS } from '../utils/paymentCustody';
import { logger } from '../utils/logger';
import { roundMoney } from '../utils/pricing';
import { notificationText } from '../utils/notificationText';

// Which order statuses the customer hears about (the words are in utils/notificationText), and which channels besides the app each is worth.
const ORDER_STATUS_MESSAGES: Record<
  string,
  {
    kind: 'order.confirmed' | 'order.preparing' | 'order.ready' | 'order.dispatched' | 'order.in_transit' | 'order.delivered' | 'order.delivery_failed' | 'order.completed' | 'order.cancelled' | 'order.refunded';
    channels: (pickup: boolean) => DeliveryChannel[];
  }
> = {
  confirmed: { kind: 'order.confirmed', channels: () => ['push'] },
  preparing: { kind: 'order.preparing', channels: () => [] },
  ready: { kind: 'order.ready', channels: (pickup) => (pickup ? ['push'] : []) },
  dispatched: { kind: 'order.dispatched', channels: () => ['push'] },
  in_transit: { kind: 'order.in_transit', channels: () => ['push'] },
  delivered: { kind: 'order.delivered', channels: () => ['push', 'email'] },
  delivery_failed: { kind: 'order.delivery_failed', channels: () => ['push', 'email', 'sms'] },
  completed: { kind: 'order.completed', channels: () => [] },
  cancelled: { kind: 'order.cancelled', channels: () => ['push', 'email', 'sms'] },
  refunded: { kind: 'order.refunded', channels: () => ['push', 'email'] },
};

/**
 * Socket rooms of everyone party to an order: whoever has its page open, the customer, its
 * kitchens and its rider. Each client then reloads what it shows, so payloads stay small and
 * never carry anything a party may not see (signed file links, the handover code).
 */
async function orderAudience(
  orderId: string
): Promise<{ rooms: string[]; customerId: string | null; orderNumber: string; deliveryType: string; sellerUserIds: string[]; cancelledBy: string | null; cancellationReason: string | null } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      orderNumber: true,
      deliveryType: true,
      cancelledBy: true,
      cancellationReason: true,
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
  return { rooms, customerId: order.customerId, orderNumber: order.orderNumber, deliveryType: order.deliveryType, sellerUserIds, cancelledBy: order.cancelledBy, cancellationReason: order.cancellationReason };
}

function findOrderForKitchens(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          seller: { select: { userId: true, businessName: true } },
          product: { select: { name: true } },
        },
      },
    },
  });
}

type KitchenOrder = NonNullable<Awaited<ReturnType<typeof findOrderForKitchens>>>;
type KitchenItem = { productName: string; quantity: number; totalPrice: number };

function itemsByKitchen(order: KitchenOrder) {
  const byKitchen = new Map<string, KitchenItem[]>();
  for (const item of order.items) {
    if (!item.seller.userId) continue;
    const items = byKitchen.get(item.seller.userId) ?? [];
    items.push({ productName: item.product?.name || item.productName, quantity: item.quantity, totalPrice: Number(item.totalPrice) });
    byKitchen.set(item.seller.userId, items);
  }
  return byKitchen;
}

// A kitchen is told what its own dishes come to: the order total also holds other kitchens' dishes, tax and the delivery fee.
const dishesTotalOf = (items: KitchenItem[]) => roundMoney(items.reduce((sum, item) => sum + item.totalPrice, 0));

function emitToKitchens(order: KitchenOrder, byKitchen: Map<string, KitchenItem[]>) {
  for (const [sellerUserId, items] of byKitchen) {
    socketManager.emitToUser(sellerUserId, 'order:new', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      // The whole order, kept for older apps; `dishesTotal` is this kitchen's part.
      totalAmount: Number(order.totalAmount),
      dishesTotal: dishesTotalOf(items),
      items,
      createdAt: order.createdAt.toISOString(),
    });
  }
}

export class RealtimeOrderService {
  /**
   * Tell an order's parties its status changed. Called after the change is committed, so it never throws:
   * a failure here (the database blipping) must not turn the committed change into an error for the caller.
   */
  async emitOrderStatusUpdate(orderId: string, status: string, changedBy?: string) {
    try {
      await this.sendOrderStatusUpdate(orderId, status, changedBy);
    } catch (err) {
      logger.error({ err, orderId, status }, 'order:status:update event failed');
    }
  }

  private async sendOrderStatusUpdate(orderId: string, status: string, changedBy?: string) {
    const audience = await orderAudience(orderId);
    if (!audience) {
      return;
    }

    // Who made the change decides the notifications below, but the id never leaves the server: this
    // payload reaches the customer, every kitchen and the rider, and none should learn another's account id.
    const orderData = {
      orderId,
      orderNumber: audience.orderNumber,
      status,
      updatedAt: new Date().toISOString(),
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
        text: notificationText(statusMessage.kind, { orderNumber: audience.orderNumber, pickup, cancelledBy: audience.cancelledBy, reason: audience.cancellationReason }),
        actionUrl: `/orders/${orderId}`,
        data: { orderId, orderNumber: audience.orderNumber, status },
        // A change the customer made themselves (cancelling) needs no alert.
        channels: changedBy === audience.customerId ? [] : statusMessage.channels(pickup),
        dedupeKey: `order:${orderId}:${status}:customer`,
      });
    }

    // Kitchens hear about a cancellation they didn't make themselves.
    if (status === 'cancelled') {
      const by = changedBy === audience.customerId ? 'customer' : changedBy === 'system' ? 'system' : 'support';
      await notifyMany(
        audience.sellerUserIds.filter((id) => id !== changedBy),
        (sellerUserId) => ({
          category: 'orders',
          type: 'order',
          text: notificationText('kitchen.orderCancelled', { orderNumber: audience.orderNumber, by }),
          actionUrl: `/sellers/orders/${orderId}`,
          data: { orderId, orderNumber: audience.orderNumber, status },
          channels: ['push', 'email'],
          dedupeKey: `order:${orderId}:cancelled:${sellerUserId}`,
        })
      );
    }
  }

  /** A dish's status changed (after the change is committed, so this never throws, like emitOrderStatusUpdate). */
  async emitOrderItemStatusUpdate(orderItemId: string, status: string, _sellerId?: string) {
    try {
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: orderItemId },
        select: { id: true, orderId: true },
      });
      if (!orderItem) return;
      const audience = await orderAudience(orderItem.orderId);
      if (!audience) return;

      socketManager.emitToRooms(audience.rooms, 'order:item:status:update', {
        orderItemId: orderItem.id,
        orderId: orderItem.orderId,
        orderNumber: audience.orderNumber,
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err, orderItemId, status }, 'order:item:status:update event failed');
    }
  }

  // The emitters below are best-effort and never throw: a lost live update is caught up by
  // the client's reload on reconnect, never worth failing the action that caused it.

  /** A new chat message on an order: its parties reload the conversation. Says who by role, never by account id. */
  async emitOrderMessage(orderId: string, messageId: string, senderRole: string) {
    try {
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'order:message', { orderId, messageId, senderRole });
    } catch (err) {
      logger.error({ err, orderId }, 'order:message event failed');
    }
  }

  /** Someone read an order's messages: the senders' read ticks update. */
  async emitMessagesRead(orderId: string) {
    try {
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'order:messages:read', { orderId });
    } catch (err) {
      logger.error({ err, orderId }, 'order:messages:read event failed');
    }
  }

  /**
   * A delivery job joined the open pool: the riders who can take it (on duty) reload their list of available jobs.
   * A job a rider just handed back is not news to them, so none of their devices hear of it.
   */
  emitDeliveryPosted(deliveryId: string, orderId: string, opts: { exceptUserId?: string } = {}) {
    const payload = { deliveryId, orderId };
    if (!opts.exceptUserId) {
      socketManager.emitToOnDutyRiders('delivery:new', payload);
      return;
    }
    try {
      socketManager.getIO().to(ON_DUTY_RIDERS_ROOM).except(`user:${opts.exceptUserId}`).emit('delivery:new', payload);
    } catch (err) {
      logger.error({ err, deliveryId }, 'delivery:new event failed');
    }
  }

  /**
   * A rider took a job: the order's parties reload, and it leaves the list of every rider on duty, unless
   * `toRiders` is false because no rider ever heard of it (a job taken automatically the moment it was created).
   */
  async emitDeliveryClaimed(deliveryId: string, orderId: string, opts: { toRiders?: boolean } = {}) {
    try {
      if (opts.toRiders !== false) socketManager.emitToOnDutyRiders('delivery:removed', { deliveryId, orderId, reason: 'claimed' });
      const audience = await orderAudience(orderId);
      if (audience) socketManager.emitToRooms(audience.rooms, 'delivery:assigned', { deliveryId, orderId });
    } catch (err) {
      logger.error({ err, orderId, deliveryId }, 'delivery:assigned event failed');
    }
  }

  /**
   * Emit new order notification to sellers
   */
  async emitNewOrderNotification(orderId: string) {
    const order = await findOrderForKitchens(orderId);
    if (!order) {
      return;
    }
    const sellerOrders = itemsByKitchen(order);

    const totalAmountFormatted = `Rs ${Number(order.totalAmount).toLocaleString()}`;

    // Confirm to the customer that their order was placed (by email too, as a record).
    if (order.customerId) {
      await notify({
        userId: order.customerId,
        category: 'orders',
        type: 'order',
        text: notificationText('order.placed', { orderNumber: order.orderNumber, total: totalAmountFormatted }),
        actionUrl: `/orders/${order.id}`,
        data: { orderId: order.id, orderNumber: order.orderNumber },
        channels: ['email'],
        dedupeKey: `order:${order.id}:placed`,
      });
    }

    // An order waiting for its online payment is only worth an alert once it is paid
    // (see online-payment.service): a kitchen shouldn't start on an unpaid order.
    const awaitingOnlinePayment = ONLINE_GATEWAY_METHODS.includes(order.paymentMethod) && order.paymentStatus !== 'paid';

    // The live event opens the kitchen's alert with an Accept button: an unpaid online order waits for
    // emitKitchenNewOrder, which the payment settlement sends.
    if (!awaitingOnlinePayment) emitToKitchens(order, sellerOrders);
    for (const [sellerUserId, items] of sellerOrders) {
      const dishesFormatted = `Rs ${dishesTotalOf(items).toLocaleString()}`;
      await notify({
        userId: sellerUserId,
        category: 'orders',
        type: 'order',
        text: notificationText(awaitingOnlinePayment ? 'kitchen.newOrderAwaitingPayment' : 'kitchen.newOrder', { orderNumber: order.orderNumber, dishesTotal: dishesFormatted }),
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

  /** The kitchen's new-order alert for an online order that has just been paid and still waits to be accepted. */
  async emitKitchenNewOrder(orderId: string) {
    const order = await findOrderForKitchens(orderId);
    if (!order || order.orderStatus !== 'pending') return;
    emitToKitchens(order, itemsByKitchen(order));
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

    // A kitchen sees its own dishes only (the same as on its order page), never another kitchen's.
    const visibleItems = isCustomer || isAdmin ? order.items : order.items.filter((item) => item.seller.userId === userId);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      deliveredAt: order.deliveredAt,
      // Who made a change is an account id: the customer, a kitchen or a rider never learns another's.
      statusHistory: order.statusHistory.map((history) => ({
        status: history.status,
        notes: history.notes,
        createdAt: history.createdAt,
      })),
      items: visibleItems.map((item) => ({
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
   * Where the rider is, for the customer only (wherever they are in the app). The order's room also holds the
   * kitchens, who see the status but not where the rider is (see getOrderDetails), and no admin screen shows a
   * rider's position, so admins are not sent a sample every few seconds for every delivery on the platform.
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

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (order?.customerId) socketManager.emitToUser(order.customerId, 'order:delivery:tracking', trackingData);
  }
}

export default new RealtimeOrderService();

