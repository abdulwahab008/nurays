import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { haversineKm } from '../utils/deliveryFee';

const AVG_CITY_SPEED_KMH = 18;

/**
 * Rider / last-mile delivery. Live tracking is intentionally $0 to run:
 * positions come from the rider's browser Geolocation API, distance/ETA use
 * haversine, the map uses OpenStreetMap tiles, and updates ride the existing
 * socket — no paid maps/routing APIs, no extra infrastructure.
 */
export class RiderService {
  /** Get or lazily create the Rider profile for a rider user. */
  private async ensureRider(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true, profile: { select: { city: true } } },
    });
    if (!user || user.userType !== 'rider') {
      throw new AppError('Rider access required', 403, 'NOT_A_RIDER');
    }
    const existing = await prisma.rider.findUnique({ where: { userId } });
    if (existing) return existing;
    return prisma.rider.create({
      data: { userId, city: user.profile?.city || 'Karachi' },
    });
  }

  private destCoords(order: { deliveryAddress: { latitude: unknown; longitude: unknown } | null }) {
    const lat = order.deliveryAddress?.latitude != null ? Number(order.deliveryAddress.latitude) : null;
    const lng = order.deliveryAddress?.longitude != null ? Number(order.deliveryAddress.longitude) : null;
    return { lat, lng };
  }

  /** Orders ready for delivery that no rider has taken yet. */
  async getAvailableDeliveries(userId: string) {
    await this.ensureRider(userId);
    const orders = await prisma.order.findMany({
      where: {
        deliveryType: 'home_delivery',
        orderStatus: { in: ['ready', 'dispatched'] },
        delivery: { is: null }, // no Delivery row yet
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        deliveryAddress: true,
        items: {
          include: { seller: { select: { businessName: true, latitude: true, longitude: true } } },
        },
      },
    });

    return orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.orderStatus,
      total: Number(o.totalAmount),
      itemCount: o.items.length,
      seller: o.items[0]?.seller?.businessName ?? 'Kitchen',
      deliveryAddress: [o.deliveryAddress?.addressLine1, o.deliveryAddress?.area, o.deliveryAddress?.city]
        .filter(Boolean)
        .join(', ') || (o.deliveryAddressSnapshot as any)?.address || 'Address on file',
      createdAt: o.createdAt,
    }));
  }

  /** The rider's active deliveries (not yet completed). */
  async getMyDeliveries(userId: string) {
    const rider = await this.ensureRider(userId);
    const deliveries = await prisma.delivery.findMany({
      where: { riderId: rider.id, status: { notIn: ['delivered', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            deliveryAddress: true,
            items: { include: { seller: { select: { businessName: true } } } },
          },
        },
      },
    });

    return deliveries.map((d) => ({
      orderId: d.orderId,
      orderNumber: d.order.orderNumber,
      deliveryStatus: d.status,
      orderStatus: d.order.orderStatus,
      total: Number(d.order.totalAmount),
      itemCount: d.order.items.length,
      seller: d.order.items[0]?.seller?.businessName ?? 'Kitchen',
      deliveryAddress:
        [d.order.deliveryAddress?.addressLine1, d.order.deliveryAddress?.area, d.order.deliveryAddress?.city]
          .filter(Boolean)
          .join(', ') ||
        (d.order.deliveryAddressSnapshot as { address?: string } | null)?.address ||
        d.deliveryAddress ||
        'Address on file',
      dest: this.destCoords(d.order),
    }));
  }

  /** Claim an available delivery. */
  async acceptDelivery(userId: string, orderId: string) {
    const rider = await this.ensureRider(userId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryAddress: true,
        delivery: true,
        items: { include: { seller: { select: { businessName: true, latitude: true, longitude: true } } } },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.delivery && order.delivery.riderId && order.delivery.riderId !== rider.id) {
      throw new AppError('This delivery was already taken by another rider', 409, 'ALREADY_ASSIGNED');
    }
    if (!['ready', 'dispatched', 'confirmed', 'preparing'].includes(order.orderStatus)) {
      throw new AppError(`Order is not available for delivery (status: ${order.orderStatus})`, 400, 'NOT_DELIVERABLE');
    }

    const origin = order.items[0]?.seller;
    const dest = this.destCoords(order);
    const distanceKm =
      origin?.latitude != null && origin?.longitude != null && dest.lat != null && dest.lng != null
        ? haversineKm(Number(origin.latitude), Number(origin.longitude), dest.lat, dest.lng)
        : null;

    const pickupAddress = order.items[0]?.seller?.businessName ?? 'Kitchen';
    const deliveryAddress =
      [order.deliveryAddress?.addressLine1, order.deliveryAddress?.area, order.deliveryAddress?.city]
        .filter(Boolean)
        .join(', ') || 'Customer address';

    const delivery = await prisma.delivery.upsert({
      where: { orderId },
      create: {
        orderId,
        riderId: rider.id,
        pickupAddress,
        pickupLatitude: origin?.latitude != null ? Number(origin.latitude) : null,
        pickupLongitude: origin?.longitude != null ? Number(origin.longitude) : null,
        deliveryAddress,
        deliveryLatitude: dest.lat,
        deliveryLongitude: dest.lng,
        distanceKm,
        status: 'assigned',
      },
      update: { riderId: rider.id, status: 'assigned' },
    });

    return { orderId, deliveryId: delivery.id, status: delivery.status };
  }

  /** Advance the delivery: picked_up → on_the_way → delivered. */
  async updateDeliveryStatus(userId: string, orderId: string, status: string) {
    const rider = await this.ensureRider(userId);
    const allowed = ['picked_up', 'on_the_way', 'delivered'];
    if (!allowed.includes(status)) {
      throw new AppError(`Invalid delivery status: ${status}`, 400, 'INVALID_STATUS');
    }
    const delivery = await prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery || delivery.riderId !== rider.id) {
      throw new AppError('Delivery not found or not yours', 404, 'DELIVERY_NOT_FOUND');
    }

    if (status === 'delivered') {
      await prisma.$transaction(async (tx) => {
        await tx.delivery.update({ where: { orderId }, data: { status: 'delivered', deliveryTime: new Date() } });
        await tx.orderItem.updateMany({
          where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
          data: { status: 'delivered' },
        });
        await tx.order.update({ where: { id: orderId }, data: { orderStatus: 'delivered', deliveredAt: new Date() } });
        await tx.orderStatusHistory.create({
          data: { orderId, status: 'delivered', notes: 'Delivered by rider', changedBy: userId },
        });
        await tx.rider.update({ where: { id: rider.id }, data: { totalDeliveries: { increment: 1 } } });
      });
      await realtimeOrderService.emitOrderStatusUpdate(orderId, 'delivered', userId);
      return { orderId, deliveryStatus: 'delivered', orderStatus: 'delivered' };
    }

    await prisma.delivery.update({
      where: { orderId },
      data: { status, ...(status === 'picked_up' ? { pickupTime: new Date() } : {}) },
    });
    // Reflect "on the way" on the order so the customer's tracker advances.
    if (status === 'on_the_way') {
      await prisma.order.update({ where: { id: orderId }, data: { orderStatus: 'dispatched' } });
      await realtimeOrderService.emitOrderStatusUpdate(orderId, 'dispatched', userId);
    }
    return { orderId, deliveryStatus: status };
  }

  /** Push the rider's live position; broadcasts to the customer with ETA. */
  async pushLocation(userId: string, orderId: string, latitude: number, longitude: number) {
    const rider = await this.ensureRider(userId);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new AppError('Invalid coordinates', 400, 'INVALID_COORDS');
    }
    const delivery = await prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery || delivery.riderId !== rider.id) {
      throw new AppError('Delivery not found or not yours', 404, 'DELIVERY_NOT_FOUND');
    }

    let distanceKm: number | undefined;
    let eta: Date | undefined;
    if (delivery.deliveryLatitude != null && delivery.deliveryLongitude != null) {
      distanceKm = haversineKm(latitude, longitude, Number(delivery.deliveryLatitude), Number(delivery.deliveryLongitude));
      const minutes = Math.max(1, Math.round((distanceKm / AVG_CITY_SPEED_KMH) * 60));
      eta = new Date(Date.now() + minutes * 60 * 1000);
    }

    await realtimeOrderService.emitDeliveryTrackingUpdate(orderId, { latitude, longitude }, distanceKm, eta);
    return { ok: true, distanceKm, estimatedArrival: eta?.toISOString() };
  }
}

export default new RiderService();
