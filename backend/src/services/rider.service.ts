import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';

// Delivery.status lifecycle: pending (unclaimed) -> assigned (claimed) -> picked_up -> in_transit -> delivered
const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
};

// Delivery status -> order-level status it should push the order to.
const ORDER_STATUS_FOR_DELIVERY_STATUS: Record<string, string> = {
  picked_up: 'dispatched',
  in_transit: 'in_transit',
  delivered: 'delivered',
};

type DeliveryWithOrder = Prisma.DeliveryGetPayload<{
  include: { order: { select: { orderNumber: true; totalAmount: true } } };
}>;

function formatDelivery(delivery: DeliveryWithOrder) {
  return {
    id: delivery.id,
    orderId: delivery.orderId,
    orderNumber: delivery.order?.orderNumber,
    pickupAddress: delivery.pickupAddress,
    deliveryAddress: delivery.deliveryAddress,
    status: delivery.status,
    pickupTime: delivery.pickupTime,
    deliveryTime: delivery.deliveryTime,
    createdAt: delivery.createdAt,
  };
}

export class RiderService {
  /**
   * Create a pending (unclaimed) delivery job for an order once it's ready for dispatch.
   * Idempotent — safe to call from multiple order-status call sites. Hub/self-pickup
   * orders never need a rider, so those are skipped.
   */
  async ensureDeliveryForOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { seller: { select: { businessName: true } } }, take: 1 },
        deliveryAddress: true,
      },
    });
    if (!order || order.deliveryType !== 'home_delivery') return;

    const existing = await prisma.delivery.findUnique({ where: { orderId } });
    if (existing) return;

    const snapshot = order.deliveryAddressSnapshot as Record<string, string> | null;
    const deliveryAddress = order.deliveryAddress
      ? [order.deliveryAddress.addressLine1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')
      : snapshot
        ? [snapshot.addressLine1, snapshot.area, snapshot.city].filter(Boolean).join(', ')
        : 'Address unavailable';

    try {
      await prisma.delivery.create({
        data: {
          orderId,
          pickupAddress: order.items[0]?.seller?.businessName ?? 'Seller pickup',
          deliveryAddress,
          status: 'pending',
        },
      });
    } catch (err) {
      // Two order-status call sites (admin + seller) can race to create the
      // same order's delivery job; the loser hits Delivery.orderId's unique
      // constraint. That's fine — a row now exists either way — so swallow
      // exactly that error instead of surfacing a 500 for an otherwise-successful
      // status update.
      const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isDuplicate) throw err;
    }
  }

  private async requireRider(userId: string) {
    const rider = await prisma.rider.findUnique({ where: { userId } });
    if (!rider) {
      throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
    }
    if (rider.verificationStatus === 'rejected') {
      throw new AppError('Your rider application was not approved', 403, 'RIDER_REJECTED');
    }
    if (rider.verificationStatus !== 'approved') {
      throw new AppError('Your rider account is pending admin approval', 403, 'RIDER_NOT_APPROVED');
    }
    if (rider.status !== 'active') {
      throw new AppError('Your rider account is suspended', 403, 'RIDER_SUSPENDED');
    }
    return rider;
  }

  async getAvailableDeliveries(userId: string) {
    await this.requireRider(userId);
    const deliveries = await prisma.delivery.findMany({
      where: { riderId: null, status: 'pending' },
      include: { order: { select: { orderNumber: true, totalAmount: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return deliveries.map(formatDelivery);
  }

  async getMyDeliveries(userId: string) {
    const rider = await this.requireRider(userId);
    const deliveries = await prisma.delivery.findMany({
      where: { riderId: rider.id },
      include: { order: { select: { orderNumber: true, totalAmount: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return deliveries.map(formatDelivery);
  }

  async claimDelivery(userId: string, deliveryId: string) {
    const rider = await this.requireRider(userId);
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }

    // Atomic claim: the WHERE clause only matches while riderId is still
    // null, so two concurrent claims can't both "succeed" — the loser's
    // updateMany matches zero rows instead of silently overwriting the winner.
    const claim = await prisma.delivery.updateMany({
      where: { id: deliveryId, riderId: null },
      data: { riderId: rider.id, status: 'assigned' },
    });
    if (claim.count === 0) {
      throw new AppError('Delivery already claimed by another rider', 409, 'ALREADY_CLAIMED');
    }

    const updated = await prisma.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { order: { select: { orderNumber: true, totalAmount: true } } },
    });
    return formatDelivery(updated);
  }

  async updateDeliveryStatus(userId: string, deliveryId: string, status: string) {
    const rider = await this.requireRider(userId);
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }
    if (delivery.riderId !== rider.id) {
      throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
    }
    if (!VALID_TRANSITIONS[delivery.status]?.includes(status)) {
      throw new AppError(`Cannot move from ${delivery.status} to ${status}`, 400, 'INVALID_TRANSITION');
    }

    // The order can independently reach a terminal state via admin
    // cancel/refund while a delivery is still in progress — refuse to push
    // it back to 'delivered'/etc. over that. A non-wallet refund only sets
    // paymentStatus (the gateway side is still pending manual processing),
    // not orderStatus, so both fields need checking here.
    const order = await prisma.order.findUnique({
      where: { id: delivery.orderId },
      select: { orderStatus: true, paymentStatus: true },
    });
    if (order && ['cancelled', 'refunded', 'completed'].includes(order.orderStatus)) {
      throw new AppError(
        `Order is already ${order.orderStatus}; delivery status can no longer be updated`,
        409,
        'ORDER_ALREADY_TERMINAL'
      );
    }
    if (order && ['refund_pending', 'refunded'].includes(order.paymentStatus)) {
      throw new AppError(
        `Order payment is ${order.paymentStatus}; delivery status can no longer be updated`,
        409,
        'ORDER_ALREADY_TERMINAL'
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (status === 'picked_up') updateData.pickupTime = new Date();
    if (status === 'delivered') updateData.deliveryTime = new Date();

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: updateData,
      include: { order: { select: { orderNumber: true, totalAmount: true } } },
    });

    const newOrderStatus = ORDER_STATUS_FOR_DELIVERY_STATUS[status];
    if (newOrderStatus) {
      await prisma.order.update({
        where: { id: delivery.orderId },
        data: {
          orderStatus: newOrderStatus,
          ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
        },
      });
      // Keep each order item's own status (what the seller's order list
      // renders) in sync with the delivery's progress — cancelled items
      // are left alone.
      await prisma.orderItem.updateMany({
        where: { orderId: delivery.orderId, status: { not: 'cancelled' } },
        data: { status: newOrderStatus },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: delivery.orderId,
          status: newOrderStatus,
          notes: `Rider marked delivery as ${status.replace('_', ' ')}`,
          changedBy: userId,
        },
      });
      await realtimeOrderService.emitOrderStatusUpdate(delivery.orderId, newOrderStatus, userId);
    }

    if (status === 'delivered') {
      await prisma.rider.update({
        where: { id: rider.id },
        data: { totalDeliveries: { increment: 1 } },
      });
    }

    return formatDelivery(updated);
  }
}

export default new RiderService();
