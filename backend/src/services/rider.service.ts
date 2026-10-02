import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import ledgerService from './ledger.service';
import { haversineKm, calculateDeliveryFeeCorridor } from '../utils/deliveryFee';

// Delivery.status lifecycle:
// pending (unclaimed) -> assigned (claimed) -> arrived_at_pickup -> picked_up -> in_transit -> arrived_at_customer -> delivered (with OTP).
// A rider holding the goods can also report delivery_failed instead of completing
// (customer unreachable, wrong address, refused delivery, etc.) — admin resolves it from there.
const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ['arrived_at_pickup', 'picked_up'],
  arrived_at_pickup: ['picked_up', 'in_transit', 'delivery_failed'],
  picked_up: ['in_transit', 'delivery_failed'],
  in_transit: ['arrived_at_customer', 'delivered', 'delivery_failed'],
  arrived_at_customer: ['delivered', 'delivery_failed'],
};

// Delivery status -> order-level status it should push the order to.
const ORDER_STATUS_FOR_DELIVERY_STATUS: Record<string, string> = {
  arrived_at_pickup: 'preparing',
  picked_up: 'dispatched',
  in_transit: 'in_transit',
  arrived_at_customer: 'in_transit',
  delivered: 'delivered',
  delivery_failed: 'delivery_failed',
};

type DeliveryWithOrder = Prisma.DeliveryGetPayload<{
  include: { order: { select: { orderNumber: true; totalAmount: true; paymentMethod: true; orderStatus: true } } };
}>;

function formatDelivery(delivery: DeliveryWithOrder & {
  arrivedAtPickup?: Date | null;
  arrivedAtCustomer?: Date | null;
  estimatedReadyAt?: Date | null;
  otpVerifiedAt?: Date | null;
  pickupLatitude?: any;
  pickupLongitude?: any;
  deliveryLatitude?: any;
  deliveryLongitude?: any;
  isRouteMatch?: boolean;
  batchBonus?: number;
  corridorDistanceKm?: number;
  riderAskFee?: number | null;
}) {
  const pickupLat = delivery.pickupLatitude != null ? Number(delivery.pickupLatitude) : 24.8607;
  const pickupLng = delivery.pickupLongitude != null ? Number(delivery.pickupLongitude) : 67.0011;
  const deliveryLat = delivery.deliveryLatitude != null ? Number(delivery.deliveryLatitude) : 24.8715;
  const deliveryLng = delivery.deliveryLongitude != null ? Number(delivery.deliveryLongitude) : 67.0594;

  const corridor = calculateDeliveryFeeCorridor(pickupLat, pickupLng, deliveryLat, deliveryLng);

  return {
    id: delivery.id,
    orderId: delivery.orderId,
    orderNumber: delivery.order?.orderNumber,
    totalAmount: delivery.order?.totalAmount ? Number(delivery.order.totalAmount) : 0,
    paymentMethod: delivery.order?.paymentMethod || 'cod',
    orderStatus: delivery.order?.orderStatus,
    pickupAddress: delivery.pickupAddress,
    deliveryAddress: delivery.deliveryAddress,
    pickupLatitude: pickupLat,
    pickupLongitude: pickupLng,
    deliveryLatitude: deliveryLat,
    deliveryLongitude: deliveryLng,
    status: delivery.status,
    pickupTime: delivery.pickupTime,
    deliveryTime: delivery.deliveryTime,
    arrivedAtPickup: delivery.arrivedAtPickup ?? null,
    arrivedAtCustomer: delivery.arrivedAtCustomer ?? null,
    estimatedReadyAt: delivery.estimatedReadyAt ?? null,
    otpVerifiedAt: delivery.otpVerifiedAt ?? null,
    createdAt: delivery.createdAt,
    // InDrive bounded price corridor
    standardFee: corridor.standardFee,
    minAskFee: corridor.minFloor,
    maxAskFee: corridor.maxCeiling,
    distanceKm: corridor.distanceKm,
    // Corridor matching & batch bonus
    isRouteMatch: Boolean(delivery.isRouteMatch),
    batchBonus: delivery.batchBonus ?? 0,
    corridorDistanceKm: delivery.corridorDistanceKm ?? corridor.distanceKm,
    riderAskFee: delivery.riderAskFee ?? null,
  };
}

export class RiderService {
  /**
   * Create a pending (unclaimed) delivery job for an order.
   * Lookahead predictive dispatch: can be invoked as soon as kitchen accepts/starts prep.
   * Generates a 4-digit customer handover PIN (OTP) for fraud prevention.
   */
  async ensureDeliveryForOrder(orderId: string, estimatedPrepMinutes: number = 25) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { seller: { select: { businessName: true, latitude: true, longitude: true, deliveryProvider: true } } } },
        deliveryAddress: true,
      },
    });
    if (!order || order.deliveryType !== 'home_delivery') return;
    // No job for an order that is finished or called off.
    if (['cancelled', 'refunded', 'delivered', 'completed'].includes(order.orderStatus)) return;

    // Sellers who deliver themselves don't post to the rider pool; they drive the
    // order to delivered / delivery_failed from their own dashboard. The provider is
    // snapshotted on the order at creation (hub stock always goes with a platform
    // rider); older orders fall back to the sellers' current settings.
    const liveItems = order.items.filter((i) => i.status !== 'cancelled');
    const needsPlatformRider = order.deliveryProvider
      ? order.deliveryProvider === 'platform' && liveItems.length > 0
      : liveItems.some((i) => i.fulfillmentType === 'hub' || i.seller?.deliveryProvider !== 'self');
    if (!needsPlatformRider) return;

    const existing = await prisma.delivery.findUnique({ where: { orderId } });
    if (existing) return;

    const snapshot = order.deliveryAddressSnapshot as Record<string, string> | null;
    const deliveryAddress = order.deliveryAddress
      ? [order.deliveryAddress.addressLine1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(', ')
      : snapshot
        ? [snapshot.addressLine1, snapshot.area, snapshot.city].filter(Boolean).join(', ')
        : 'Address unavailable';

    // Generate secure 4-digit OTP for customer doorstep verification
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const estimatedReadyAt = new Date(Date.now() + estimatedPrepMinutes * 60 * 1000);

    const pickupSeller = (order.items.find((i) => i.status !== 'cancelled' && (i.fulfillmentType === 'hub' || i.seller?.deliveryProvider !== 'self')) ?? order.items[0])?.seller;
    const pickupLat = pickupSeller?.latitude ? Number(pickupSeller.latitude) : 24.8607;
    const pickupLng = pickupSeller?.longitude ? Number(pickupSeller.longitude) : 67.0011;
    const deliveryLat = order.deliveryAddress?.latitude ? Number(order.deliveryAddress.latitude) : 24.8715;
    const deliveryLng = order.deliveryAddress?.longitude ? Number(order.deliveryAddress.longitude) : 67.0594;

    try {
      await prisma.delivery.create({
        data: {
          orderId,
          pickupAddress: pickupSeller?.businessName ?? 'Seller pickup',
          deliveryAddress,
          pickupLatitude: pickupLat,
          pickupLongitude: pickupLng,
          deliveryLatitude: deliveryLat,
          deliveryLongitude: deliveryLng,
          status: 'pending',
          deliveryOtp,
          estimatedReadyAt,
        },
      });
    } catch (err) {
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
    const rider = await this.requireRider(userId);

    // Find rider's current active orders to evaluate batching opportunities
    const activeDeliveries = await prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: { in: ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'] },
      },
    });

    const deliveries = await prisma.delivery.findMany({
      where: { riderId: null, status: 'pending' },
      include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // If rider has exactly 1 active order, look for corridor matches for their 2nd slot!
    const activeOne = activeDeliveries.length === 1 ? activeDeliveries[0] : null;

    const enriched = deliveries.map((d) => {
      let isRouteMatch = false;
      let batchBonus = 0;
      let corridorDistanceKm: number | undefined;

      if (activeOne) {
        const actPickupLat = activeOne.pickupLatitude ? Number(activeOne.pickupLatitude) : 24.8607;
        const actPickupLng = activeOne.pickupLongitude ? Number(activeOne.pickupLongitude) : 67.0011;
        const actDropLat = activeOne.deliveryLatitude ? Number(activeOne.deliveryLatitude) : 24.8715;
        const actDropLng = activeOne.deliveryLongitude ? Number(activeOne.deliveryLongitude) : 67.0594;

        const candPickupLat = d.pickupLatitude ? Number(d.pickupLatitude) : 24.8607;
        const candPickupLng = d.pickupLongitude ? Number(d.pickupLongitude) : 67.0011;
        const candDropLat = d.deliveryLatitude ? Number(d.deliveryLatitude) : 24.8715;
        const candDropLng = d.deliveryLongitude ? Number(d.deliveryLongitude) : 67.0594;

        const pickupGapKm = haversineKm(actPickupLat, actPickupLng, candPickupLat, candPickupLng);
        const dropoffGapKm = haversineKm(actDropLat, actDropLng, candDropLat, candDropLng);

        // Corridor Matching: Pickups within 1.5km AND Dropoffs within 2.5km
        if (pickupGapKm <= 1.5 && dropoffGapKm <= 2.5) {
          isRouteMatch = true;
          batchBonus = 100; // Extra Rs 100 bonus for delivering along the same route
          corridorDistanceKm = Math.round(pickupGapKm * 10) / 10;
        }
      }

      return formatDelivery({
        ...d,
        isRouteMatch,
        batchBonus,
        corridorDistanceKm,
      });
    });

    // Sort matching corridor runs to the top of available pool
    return enriched.sort((a, b) => (b.isRouteMatch ? 1 : 0) - (a.isRouteMatch ? 1 : 0));
  }

  async getMyDeliveries(userId: string) {
    const rider = await this.requireRider(userId);
    const deliveries = await prisma.delivery.findMany({
      where: { riderId: rider.id },
      include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return deliveries.map(formatDelivery);
  }

  async claimDelivery(userId: string, deliveryId: string, askFee?: number) {
    const rider = await this.requireRider(userId);

    // Rule 1: Enforce hard concurrency limit of 2 active orders max
    const activeCount = await prisma.delivery.count({
      where: {
        riderId: rider.id,
        status: { in: ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'] },
      },
    });

    if (activeCount >= 2) {
      throw new AppError(
        'Rider capacity limit reached (maximum 2 active orders). Deliver an ongoing run before claiming new orders.',
        409,
        'RIDER_CAPACITY_REACHED'
      );
    }

    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }

    // Rule 2: Validate inDrive-style bid corridor if rider submitted a custom ask fee
    let validatedAskFee: number | undefined;
    if (askFee != null && Number(askFee) > 0) {
      const pLat = delivery.pickupLatitude ? Number(delivery.pickupLatitude) : 24.8607;
      const pLng = delivery.pickupLongitude ? Number(delivery.pickupLongitude) : 67.0011;
      const dLat = delivery.deliveryLatitude ? Number(delivery.deliveryLatitude) : 24.8715;
      const dLng = delivery.deliveryLongitude ? Number(delivery.deliveryLongitude) : 67.0594;
      const corridor = calculateDeliveryFeeCorridor(pLat, pLng, dLat, dLng);

      const numericAsk = Number(askFee);
      if (numericAsk < corridor.minFloor || numericAsk > corridor.maxCeiling) {
        throw new AppError(
          `Bid of Rs ${numericAsk} is out of bounds. The allowed corridor for this location is Rs ${corridor.minFloor} to Rs ${corridor.maxCeiling}.`,
          400,
          'BID_OUT_OF_BOUNDS'
        );
      }
      validatedAskFee = numericAsk;
    }

    const claim = await prisma.delivery.updateMany({
      where: { id: deliveryId, riderId: null },
      data: {
        riderId: rider.id,
        status: 'assigned',
        ...(validatedAskFee ? { deliveryNotes: `Agreed delivery fee: Rs ${validatedAskFee}` } : {}),
      },
    });
    if (claim.count === 0) {
      throw new AppError('Delivery already claimed by another rider', 409, 'ALREADY_CLAIMED');
    }

    const updated = await prisma.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
    });
    return formatDelivery({ ...updated, riderAskFee: validatedAskFee });
  }

  async updateDeliveryStatus(
    userId: string,
    deliveryId: string,
    status: string,
    reason?: string,
    otp?: string
  ) {
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

    const order = await prisma.order.findUnique({
      where: { id: delivery.orderId },
      select: { orderStatus: true, paymentStatus: true, paymentMethod: true },
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
    if (status === 'arrived_at_pickup') updateData.arrivedAtPickup = new Date();
    if (status === 'picked_up' || (status === 'in_transit' && !delivery.pickupTime)) updateData.pickupTime = new Date();
    if (status === 'arrived_at_customer') updateData.arrivedAtCustomer = new Date();
    if (status === 'delivered') {
      // Validate customer doorstep delivery PIN (OTP)
      if (delivery.deliveryOtp) {
        if (!otp || otp.trim() !== delivery.deliveryOtp) {
          throw new AppError(
            'Invalid or missing 4-digit customer delivery PIN. Please ask the customer for the PIN displayed on their order screen.',
            400,
            'INVALID_DELIVERY_OTP'
          );
        }
        updateData.otpVerifiedAt = new Date();
      }
      updateData.deliveryTime = new Date();
    }
    if (status === 'delivery_failed') updateData.deliveryNotes = reason;

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: updateData,
      include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
    });

    const newOrderStatus = ORDER_STATUS_FOR_DELIVERY_STATUS[status];
    if (newOrderStatus) {
      const isCodPayment = order?.paymentMethod === 'cod' && order.paymentStatus !== 'paid';
      await prisma.order.update({
        where: { id: delivery.orderId },
        data: {
          orderStatus: newOrderStatus,
          ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
          ...(status === 'delivered' && isCodPayment ? { paymentStatus: 'paid', paymentCollectedBy: 'rider', paidAt: new Date() } : {}),
        },
      });

      await prisma.orderItem.updateMany({
        where: { orderId: delivery.orderId, status: { not: 'cancelled' } },
        data: { status: newOrderStatus },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: delivery.orderId,
          status: newOrderStatus,
          notes:
            status === 'delivery_failed'
              ? `Rider reported failed delivery: ${reason}`
              : status === 'delivered'
                ? 'Rider delivered order (verified via customer PIN)'
                : `Rider marked delivery as ${status.replace(/_/g, ' ')}`,
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

      // Post immutable entries to double-entry financial ledger
      try {
        await ledgerService.recordOrderCompletion(delivery.orderId);
      } catch (ledgerErr) {
        console.error('Failed to record financial ledger entries for order:', delivery.orderId, ledgerErr);
      }
    }

    return formatDelivery(updated);
  }

  async getRiderProfile(userId: string) {
    const rider = await this.requireRider(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    // Calculate cash in hand (COD orders delivered by this rider)
    const codDeliveries = await prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: 'delivered',
        order: { paymentMethod: 'cod' },
      },
      include: { order: { select: { totalAmount: true } } },
    });

    const cashInHand = codDeliveries.reduce(
      (sum, d) => sum + (d.order?.totalAmount ? Number(d.order.totalAmount) : 0),
      0
    );

    return {
      id: rider.id,
      name: user?.profile?.fullName || 'Tariq Mehmood',
      phone: user?.phone || '+92 300 1234567',
      vehicleType: rider.vehicleType || 'Motorbike (Cold-Box)',
      vehicleNumber: rider.vehicleNumber || 'KHI-8921',
      city: rider.city || 'Karachi',
      ratingAverage: Number(rider.ratingAverage || 4.9),
      totalDeliveries: rider.totalDeliveries,
      isAvailable: rider.isAvailable,
      cashInHand,
      floatingLimit: 10000,
    };
  }

  async toggleDutyStatus(userId: string, isAvailable?: boolean) {
    const rider = await this.requireRider(userId);
    const newStatus = isAvailable !== undefined ? isAvailable : !rider.isAvailable;
    const updated = await prisma.rider.update({
      where: { id: rider.id },
      data: { isAvailable: newStatus },
    });
    return { isAvailable: updated.isAvailable };
  }

  /**
   * Update rider GPS location and evaluate geofences.
   * Automatically triggers:
   * - 'arrived_at_pickup' when rider enters kitchen geofence (<= 150m) and status is 'assigned'
   * - 'arrived_at_customer' when rider enters customer doorstep geofence (<= 150m) and status is 'in_transit'
   */
  async updateRiderLocation(userId: string, deliveryId: string, latitude: number, longitude: number) {
    const rider = await this.requireRider(userId);
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }
    if (delivery.riderId !== rider.id) {
      throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
    }

    const pickupLat = delivery.pickupLatitude ? Number(delivery.pickupLatitude) : 24.8607;
    const pickupLng = delivery.pickupLongitude ? Number(delivery.pickupLongitude) : 67.0011;
    const dropoffLat = delivery.deliveryLatitude ? Number(delivery.deliveryLatitude) : 24.8715;
    const dropoffLng = delivery.deliveryLongitude ? Number(delivery.deliveryLongitude) : 67.0594;

    const distanceToPickupKm = haversineKm(latitude, longitude, pickupLat, pickupLng);
    const distanceToDeliveryKm = haversineKm(latitude, longitude, dropoffLat, dropoffLng);

    const distanceToPickupMeters = Math.round(distanceToPickupKm * 1000);
    const distanceToDeliveryMeters = Math.round(distanceToDeliveryKm * 1000);

    const GEOFENCE_THRESHOLD_KM = 0.15; // 150 meters

    let autoTriggeredStatus: string | null = null;
    let updatedDelivery = delivery;

    // Auto-Event 1: If assigned and rider enters kitchen geofence (<= 150m)
    if (delivery.status === 'assigned' && distanceToPickupKm <= GEOFENCE_THRESHOLD_KM) {
      autoTriggeredStatus = 'arrived_at_pickup';
      await this.updateDeliveryStatus(userId, deliveryId, 'arrived_at_pickup');
      const refreshed = await prisma.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
      });
      updatedDelivery = refreshed;
    }
    // Auto-Event 2: If in_transit and rider enters customer geofence (<= 150m)
    else if (delivery.status === 'in_transit' && distanceToDeliveryKm <= GEOFENCE_THRESHOLD_KM) {
      autoTriggeredStatus = 'arrived_at_customer';
      await this.updateDeliveryStatus(userId, deliveryId, 'arrived_at_customer');
      const refreshed = await prisma.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } },
      });
      updatedDelivery = refreshed;
    }

    return {
      delivery: formatDelivery(updatedDelivery),
      currentLocation: { latitude, longitude },
      distanceToPickupMeters,
      distanceToDeliveryMeters,
      isInsidePickupGeofence: distanceToPickupKm <= GEOFENCE_THRESHOLD_KM,
      isInsideDeliveryGeofence: distanceToDeliveryKm <= GEOFENCE_THRESHOLD_KM,
      autoTriggeredStatus,
    };
  }
}

export default new RiderService();

