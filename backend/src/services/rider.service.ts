import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import ledgerService from './ledger.service';
import { haversineKm, calculateDeliveryFeeCorridor } from '../utils/deliveryFee';
import { jobScore } from '../utils/ranking';
import { newHandoverCode, verifyHandoverCode } from './handover.service';
import { cashLimitOf, listRiderEntries, postDeliveryEntries, riderEarningsSummary, riderMoney } from './rider-ledger.service';
import { assertOwnDocument } from '../utils/documents';
import { presentFile } from '../storage';

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

// Delivery status -> order-level status it should push the order to. Only forward:
// a rider arriving at the kitchen says nothing about the food, so it no longer moves
// a ready order back to "preparing".
const ORDER_STATUS_FOR_DELIVERY_STATUS: Record<string, string> = {
  picked_up: 'dispatched',
  in_transit: 'in_transit',
  arrived_at_customer: 'in_transit',
  delivered: 'delivered',
  delivery_failed: 'delivery_failed',
};

// The handover code is never part of a delivery we send anywhere (the client omits it globally).
type DeliveryWithOrder = Omit<
  Prisma.DeliveryGetPayload<{
    include: { order: { select: { orderNumber: true; totalAmount: true; paymentMethod: true; orderStatus: true } } };
  }>,
  'deliveryOtp'
>;

// Jobs a rider is working on. They share their location while on one of these.
const ACTIVE_STATUSES = ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'];
// Once the food has left the kitchen, the customer can see where it is.
const ON_THE_WAY_STATUSES = ['picked_up', 'in_transit', 'arrived_at_customer'];
const GEOFENCE_KM = 0.15; // 150 m
// A phone reporting every second is stored (and passed on to the customer) at most this often.
const LOCATION_MIN_INTERVAL_MS = 3_000;

const DELIVERY_INCLUDE = { order: { select: { orderNumber: true, totalAmount: true, paymentMethod: true, orderStatus: true } } } as const;

const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

/** A job's two ends, or nulls where a location isn't known (never a made-up one). */
function endsOf(d: { pickupLatitude?: unknown; pickupLongitude?: unknown; deliveryLatitude?: unknown; deliveryLongitude?: unknown }) {
  return {
    pickupLat: num(d.pickupLatitude),
    pickupLng: num(d.pickupLongitude),
    deliveryLat: num(d.deliveryLatitude),
    deliveryLng: num(d.deliveryLongitude),
  };
}

/** Cash the rider will take at the door on jobs they already have (unpaid cash orders). */
function cashToCollect(jobs: Array<{ order: { paymentMethod: string; paymentStatus: string; totalAmount: unknown } }>) {
  return jobs.reduce((sum, d) => sum + (d.order.paymentMethod === 'cod' && d.order.paymentStatus !== 'paid' ? Number(d.order.totalAmount) : 0), 0);
}

const PAYMENT_INCLUDE = { order: { select: { paymentMethod: true, paymentStatus: true, totalAmount: true } } } as const;

const ROUTE_BONUS = 100;

/**
 * Route bonus for taking a second job along the way: pickups within 1.5 km and drop-offs
 * within 2.5 km of the rider's one active job. Needs both jobs' locations.
 */
function routeMatch(active: Parameters<typeof endsOf>[0] | null, candidate: Parameters<typeof endsOf>[0]) {
  if (!active) return null;
  const a = endsOf(active);
  const c = endsOf(candidate);
  if ([a.pickupLat, a.pickupLng, a.deliveryLat, a.deliveryLng, c.pickupLat, c.pickupLng, c.deliveryLat, c.deliveryLng].some((v) => v == null)) return null;
  const pickupGapKm = haversineKm(a.pickupLat!, a.pickupLng!, c.pickupLat!, c.pickupLng!);
  const dropoffGapKm = haversineKm(a.deliveryLat!, a.deliveryLng!, c.deliveryLat!, c.deliveryLng!);
  return pickupGapKm <= 1.5 && dropoffGapKm <= 2.5 ? { bonus: ROUTE_BONUS, corridorDistanceKm: Math.round(pickupGapKm * 10) / 10 } : null;
}

function formatDelivery(delivery: DeliveryWithOrder & {
  arrivedAtPickup?: Date | null;
  arrivedAtCustomer?: Date | null;
  estimatedReadyAt?: Date | null;
  otpVerifiedAt?: Date | null;
  pickupLatitude?: any;
  pickupLongitude?: any;
  deliveryLatitude?: any;
  deliveryLongitude?: any;
  riderFee?: any;
  riderBonus?: any;
  isRouteMatch?: boolean;
  batchBonus?: number;
  corridorDistanceKm?: number;
  riderAskFee?: number | null;
  exceedsCashLimit?: boolean;
}) {
  const { pickupLat, pickupLng, deliveryLat, deliveryLng } = endsOf(delivery);
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
    // Fixed when the job is claimed: what this rider is paid for it.
    riderFee: num(delivery.riderFee),
    riderBonus: num(delivery.riderBonus),
    // A cash order that would take the rider past their cash limit.
    exceedsCashLimit: Boolean(delivery.exceedsCashLimit),
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

    // The customer's handover code lives on the order. Older orders created without
    // one get it now, before a rider can be assigned.
    await prisma.order.updateMany({ where: { id: orderId, handoverCode: null }, data: { handoverCode: newHandoverCode() } });
    const estimatedReadyAt = new Date(Date.now() + estimatedPrepMinutes * 60 * 1000);

    const pickupSeller = (order.items.find((i) => i.status !== 'cancelled' && (i.fulfillmentType === 'hub' || i.seller?.deliveryProvider !== 'self')) ?? order.items[0])?.seller;
    // Unknown locations stay unknown (null): a guessed point would misprice the job.
    const pickupLat = num(pickupSeller?.latitude);
    const pickupLng = num(pickupSeller?.longitude);
    const deliveryLat = num(order.deliveryAddress?.latitude);
    const deliveryLng = num(order.deliveryAddress?.longitude);

    try {
      const created = await prisma.delivery.create({
        data: {
          orderId,
          pickupAddress: pickupSeller?.businessName ?? 'Seller pickup',
          deliveryAddress,
          pickupLatitude: pickupLat,
          pickupLongitude: pickupLng,
          deliveryLatitude: deliveryLat,
          deliveryLongitude: deliveryLng,
          status: 'pending',
          estimatedReadyAt,
        },
      });
      realtimeOrderService.emitDeliveryPosted(created.id, orderId);
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

  /**
   * Open jobs, best first for this rider (see jobScore in utils/ranking.ts): on the way of
   * the job they carry, close to where they are, waiting longest, paying best per km.
   * `position` is where the rider's phone says they are; without it, their last shared
   * location from the past 30 minutes is used.
   */
  async getAvailableDeliveries(userId: string, position?: { lat: number; lng: number }) {
    const rider = await this.requireRider(userId);

    // Find rider's current active orders to evaluate batching opportunities
    const activeDeliveries = await prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        status: { in: ACTIVE_STATUSES },
      },
      include: PAYMENT_INCLUDE,
    });

    const deliveries = await prisma.delivery.findMany({
      // Only jobs for orders still going somewhere.
      where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } } },
      include: DELIVERY_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    // With exactly one active job, jobs along the same route earn a bonus.
    const activeOne = activeDeliveries.length === 1 ? activeDeliveries[0] : null;
    // Cash in hand plus cash still to collect on jobs already taken, against the limit.
    const cashCommitted = (await riderMoney(prisma, rider.id)).cashHeld + cashToCollect(activeDeliveries);
    const cashLimit = cashLimitOf(rider);

    let here = position ?? null;
    if (!here) {
      const recent = activeDeliveries
        .filter((d) => d.riderLatitude != null && d.riderLongitude != null && d.riderLocationAt && Date.now() - d.riderLocationAt.getTime() < 30 * 60_000)
        .sort((a, b) => b.riderLocationAt!.getTime() - a.riderLocationAt!.getTime())[0];
      if (recent) here = { lat: Number(recent.riderLatitude), lng: Number(recent.riderLongitude) };
    }

    const now = Date.now();
    const ranked = deliveries.map((d) => {
      const match = routeMatch(activeOne, d);
      const cashOrder = d.order.paymentMethod === 'cod';
      const job = formatDelivery({
        ...d,
        isRouteMatch: !!match,
        batchBonus: match?.bonus ?? 0,
        corridorDistanceKm: match?.corridorDistanceKm,
        exceedsCashLimit: cashOrder && cashCommitted + Number(d.order.totalAmount) > cashLimit,
      });
      const pickupDistanceKm =
        here && job.pickupLatitude != null && job.pickupLongitude != null
          ? Math.round(haversineKm(here.lat, here.lng, job.pickupLatitude, job.pickupLongitude) * 10) / 10
          : null;
      const score = jobScore({
        routeMatch: job.isRouteMatch,
        pickupDistanceKm,
        waitingMinutes: (now - new Date(job.createdAt).getTime()) / 60_000,
        riderFee: job.standardFee + job.batchBonus,
        tripKm: job.distanceKm ?? null,
        exceedsCashLimit: job.exceedsCashLimit,
      });
      return { job: { ...job, pickupDistanceKm }, score };
    });
    return ranked.sort((a, b) => b.score - a.score).map((r) => r.job);
  }

  async getMyDeliveries(userId: string) {
    const rider = await this.requireRider(userId);
    const deliveries = await prisma.delivery.findMany({
      where: { riderId: rider.id },
      include: DELIVERY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return deliveries.map(formatDelivery);
  }

  async claimDelivery(userId: string, deliveryId: string, askFee?: number) {
    const rider = await this.requireRider(userId);
    if (!rider.isAvailable) {
      throw new AppError('You are off duty. Switch to on duty to take new jobs.', 409, 'RIDER_OFF_DUTY');
    }

    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }

    // The rider's pay for this job: the standard fee, or their own ask within the allowed
    // range (inDrive style), fixed now so the job's price can't change under them.
    const ends = endsOf(delivery);
    const corridor = calculateDeliveryFeeCorridor(ends.pickupLat, ends.pickupLng, ends.deliveryLat, ends.deliveryLng);
    let validatedAskFee: number | undefined;
    if (askFee != null && Number(askFee) > 0) {
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

    // One claim at a time per rider (their row locked), so two quick claims can't both pass
    // the two-job and cash limits.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${rider.id} FOR UPDATE`;

      // At most two jobs at once.
      const active = await tx.delivery.findMany({ where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } }, include: PAYMENT_INCLUDE });
      if (active.length >= 2) {
        throw new AppError(
          'Rider capacity limit reached (maximum 2 active orders). Deliver an ongoing run before claiming new orders.',
          409,
          'RIDER_CAPACITY_REACHED'
        );
      }

      const liveOrder = await tx.order.findFirst({
        where: { id: delivery.orderId, orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } },
        select: { id: true, paymentMethod: true, paymentStatus: true, totalAmount: true },
      });
      if (!liveOrder || delivery.status !== 'pending') {
        throw new AppError('This job is no longer available', 409, 'DELIVERY_UNAVAILABLE');
      }

      // No more customer cash than the rider's limit, counting what they hold and what they'll
      // collect on the jobs they already have. Prepaid jobs are always fine.
      if (liveOrder.paymentMethod === 'cod' && liveOrder.paymentStatus !== 'paid') {
        const { cashHeld } = await riderMoney(tx, rider.id);
        const toCollect = cashToCollect(active);
        const limit = cashLimitOf(rider);
        if (cashHeld + toCollect + Number(liveOrder.totalAmount) > limit) {
          const carrying = toCollect > 0
            ? `You're carrying Rs ${cashHeld.toLocaleString()} in cash and will collect Rs ${toCollect.toLocaleString()} on your current jobs`
            : `You're carrying Rs ${cashHeld.toLocaleString()} in cash`;
          throw new AppError(
            `${carrying} (limit Rs ${limit.toLocaleString()}). Hand in your cash before taking more cash orders; prepaid orders are still open to you.`,
            409,
            'CASH_LIMIT_REACHED'
          );
        }
      }

      const bonus = routeMatch(active.length === 1 ? active[0] : null, delivery)?.bonus ?? 0;
      const claim = await tx.delivery.updateMany({
        where: { id: deliveryId, riderId: null, status: 'pending' },
        data: {
          riderId: rider.id,
          status: 'assigned',
          riderFee: validatedAskFee ?? corridor.standardFee,
          riderBonus: bonus,
        },
      });
      if (claim.count === 0) {
        throw new AppError('Delivery already claimed by another rider', 409, 'ALREADY_CLAIMED');
      }
    });
    void realtimeOrderService.emitDeliveryClaimed(deliveryId, delivery.orderId);

    const updated = await prisma.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: DELIVERY_INCLUDE,
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
    const first = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, orderId: true, riderId: true, status: true, deliveryOtp: true },
    });
    if (!first) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }
    if (first.riderId !== rider.id) {
      throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
    }
    if (!VALID_TRANSITIONS[first.status]?.includes(status)) {
      throw new AppError(`Cannot move from ${first.status} to ${status}`, 400, 'INVALID_TRANSITION');
    }
    // The customer's code, checked (and wrong guesses counted) before anything changes.
    if (status === 'delivered') {
      await verifyHandoverCode(first.orderId, otp, first.deliveryOtp);
    }

    // One transaction, order row locked first (the same lock order as cancels), every
    // write guarded on the state it was decided from: a double tap, or a cancel landing
    // at the same moment, can no longer apply a transition twice or half-way.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${first.orderId} FOR UPDATE`;
      const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      if (delivery.riderId !== rider.id) {
        throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
      }
      if (delivery.status === 'cancelled') {
        throw new AppError('This delivery was cancelled', 409, 'DELIVERY_CANCELLED');
      }
      if (!VALID_TRANSITIONS[delivery.status]?.includes(status)) {
        throw new AppError(`Cannot move from ${delivery.status} to ${status}`, 400, 'INVALID_TRANSITION');
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: delivery.orderId },
        select: { orderStatus: true, paymentStatus: true, paymentMethod: true, totalAmount: true, orderNumber: true },
      });
      if (['cancelled', 'refunded', 'completed'].includes(order.orderStatus)) {
        throw new AppError(
          `Order is already ${order.orderStatus}; delivery status can no longer be updated`,
          409,
          'ORDER_ALREADY_TERMINAL'
        );
      }
      if (['refund_pending', 'refunded'].includes(order.paymentStatus)) {
        throw new AppError(
          `Order payment is ${order.paymentStatus}; delivery status can no longer be updated`,
          409,
          'ORDER_ALREADY_TERMINAL'
        );
      }
      // The food leaves the kitchen only once the kitchen has marked it ready.
      if ((status === 'picked_up' || status === 'in_transit') && delivery.status !== 'picked_up' && !['ready', 'dispatched', 'in_transit'].includes(order.orderStatus)) {
        throw new AppError(
          "The kitchen hasn't marked this order ready yet. Wait for it before picking it up.",
          409,
          'FOOD_NOT_READY'
        );
      }
      // Food paid online or by transfer leaves the kitchen only once the payment is confirmed.
      if (status === 'picked_up' && order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
        throw new AppError(
          "The customer's payment hasn't been confirmed yet; wait for the kitchen to confirm it before pickup",
          409,
          'PAYMENT_NOT_CONFIRMED'
        );
      }

      const now = new Date();
      const updateData: Record<string, unknown> = { status };
      if (status === 'arrived_at_pickup') updateData.arrivedAtPickup = now;
      if (status === 'picked_up' || (status === 'in_transit' && !delivery.pickupTime)) updateData.pickupTime = now;
      if (status === 'arrived_at_customer') updateData.arrivedAtCustomer = now;
      if (status === 'delivered') {
        updateData.otpVerifiedAt = now;
        updateData.deliveryTime = now;
      }
      if (status === 'delivery_failed') updateData.deliveryNotes = reason;

      const claimed = await tx.delivery.updateMany({
        where: { id: deliveryId, status: delivery.status, riderId: rider.id },
        data: updateData,
      });
      if (claimed.count === 0) {
        throw new AppError('This delivery was just updated; refresh and try again', 409, 'DELIVERY_STATUS_CONFLICT');
      }

      // Cash the rider takes at the door: an unpaid cash order being delivered.
      const isCodPayment = order.paymentMethod === 'cod' && order.paymentStatus !== 'paid';
      const newOrderStatus = ORDER_STATUS_FOR_DELIVERY_STATUS[status] ?? null;
      if (newOrderStatus && newOrderStatus !== order.orderStatus) {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: {
            orderStatus: newOrderStatus,
            ...(status === 'delivered' ? { deliveredAt: now } : {}),
            ...(status === 'delivered' && isCodPayment ? { paymentStatus: 'paid', paymentCollectedBy: 'rider', paidAt: now } : {}),
          },
        });
        await tx.orderItem.updateMany({
          where: { orderId: delivery.orderId, status: { not: 'cancelled' } },
          data: { status: newOrderStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            status: newOrderStatus,
            notes:
              status === 'delivery_failed'
                ? `Rider reported failed delivery: ${reason}`
                : status === 'delivered'
                  ? "Rider delivered order (verified with the customer's code)"
                  : `Rider marked delivery as ${status.replace(/_/g, ' ')}`,
            changedBy: userId,
          },
        });
      }
      if (status === 'delivered') {
        // An order an admin already marked delivered still gets its cash recorded.
        if (isCodPayment && newOrderStatus === order.orderStatus) {
          await tx.order.update({ where: { id: delivery.orderId }, data: { paymentStatus: 'paid', paymentCollectedBy: 'rider', paidAt: now } });
        }
        await tx.rider.update({ where: { id: rider.id }, data: { totalDeliveries: { increment: 1 } } });
        // The rider's pay for the job, and the cash they now carry if they took it at the door.
        await postDeliveryEntries(tx, {
          riderId: rider.id,
          deliveryId,
          orderId: delivery.orderId,
          orderNumber: order.orderNumber,
          fee: Number(delivery.riderFee ?? 0),
          bonus: Number(delivery.riderBonus ?? 0),
          cashCollected: isCodPayment ? Number(order.totalAmount) : 0,
        });
      }

      const updated = await tx.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: DELIVERY_INCLUDE,
      });
      return { updated, newOrderStatus, orderId: delivery.orderId };
    });

    // Side effects only after the commit.
    if (result.newOrderStatus) {
      await realtimeOrderService.emitOrderStatusUpdate(result.orderId, result.newOrderStatus, userId);
    }
    if (status === 'delivered') {
      try {
        await ledgerService.recordOrderCompletion(result.orderId);
      } catch (ledgerErr) {
        console.error('Failed to record financial ledger entries for order:', result.orderId, ledgerErr);
      }
    }

    return formatDelivery(result.updated);
  }

  /**
   * A rider hands a job back before picking the food up: it goes back to the pool for
   * other riders, with the fee and route bonus cleared (the next rider's claim sets them).
   */
  async releaseDelivery(userId: string, deliveryId: string) {
    const rider = await this.requireRider(userId);
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, orderId: true, riderId: true } });
    if (!delivery) throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    if (delivery.riderId !== rider.id) throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
    const released = await prisma.delivery.updateMany({
      where: { id: deliveryId, riderId: rider.id, status: { in: ['assigned', 'arrived_at_pickup'] } },
      data: { riderId: null, status: 'pending', riderFee: null, riderBonus: null, arrivedAtPickup: null },
    });
    if (released.count === 0) {
      throw new AppError('You can only hand a job back before you pick up the food', 409, 'CANNOT_RELEASE');
    }
    realtimeOrderService.emitDeliveryPosted(deliveryId, delivery.orderId);
    return { released: true };
  }

  async getRiderProfile(userId: string) {
    const rider = await this.requireRider(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    const { cashHeld, balance } = await riderMoney(prisma, rider.id);

    return {
      id: rider.id,
      // The rider's own details only: no made-up name, phone, vehicle or rating.
      name: user?.profile?.fullName || null,
      phone: user?.phone || null,
      vehicleType: rider.vehicleType || null,
      vehicleNumber: rider.vehicleNumber || null,
      city: rider.city || null,
      ratingAverage: Number(rider.ratingAverage) || 0,
      totalDeliveries: rider.totalDeliveries,
      isAvailable: rider.isAvailable,
      cashInHand: cashHeld,
      floatingLimit: cashLimitOf(rider),
      balance,
    };
  }

  /**
   * The rider's money: what the platform owes them, cash they carry against their limit,
   * recent earnings, and every entry behind it. Open to a suspended rider too: they may
   * still be owed money or still hold cash.
   */
  async getRiderEarnings(userId: string, page = 1) {
    const rider = await prisma.rider.findUnique({ where: { userId } });
    if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
    const [summary, history] = await Promise.all([riderEarningsSummary(rider), listRiderEntries(rider.id, page)]);
    return { ...summary, ...history };
  }

  /** The rider's own application: their details, documents on file and where it stands. */
  async getMyApplication(userId: string) {
    const rider = await prisma.rider.findUnique({ where: { userId }, include: { documents: { orderBy: { createdAt: 'desc' } } } });
    if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
    return {
      verificationStatus: rider.verificationStatus,
      rejectionReason: rider.rejectionReason,
      status: rider.status,
      city: rider.city,
      vehicleType: rider.vehicleType,
      vehicleNumber: rider.vehicleNumber,
      licenseNumber: rider.licenseNumber,
      documents: await Promise.all(rider.documents.map(async (d) => ({ type: d.documentType, url: await presentFile(d.documentUrl), uploadedAt: d.createdAt }))),
    };
  }

  /**
   * A rider sends (or, after a rejection, sends again) their application: vehicle and photos
   * of both sides of their CNIC and their driving licence, uploaded here. It goes back to the
   * admins for review. An approved rider changes details through support instead.
   */
  async submitApplication(
    userId: string,
    data: { city: string; vehicleType: string; vehicleNumber: string; licenseNumber?: string; cnicFrontUrl?: string; cnicBackUrl?: string; licenseUrl?: string }
  ) {
    const rider = await prisma.rider.findUnique({ where: { userId }, include: { documents: { select: { documentType: true } } } });
    if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
    if (rider.verificationStatus === 'approved') {
      throw new AppError('Your account is already approved. Contact support to change your details.', 409, 'ALREADY_APPROVED');
    }
    const docs: Record<string, string | null> = {
      cnic_front: data.cnicFrontUrl ? assertOwnDocument(data.cnicFrontUrl, userId, 'front of your CNIC') : null,
      cnic_back: data.cnicBackUrl ? assertOwnDocument(data.cnicBackUrl, userId, 'back of your CNIC') : null,
      license: data.licenseUrl ? assertOwnDocument(data.licenseUrl, userId, 'photo of your driving licence') : null,
    };
    const onFile = new Set(rider.documents.map((d) => d.documentType));
    if (Object.entries(docs).some(([type, url]) => !url && !onFile.has(type))) {
      throw new AppError('Please upload photos of both sides of your CNIC and of your driving licence.', 400, 'DOCUMENTS_REQUIRED');
    }

    await prisma.$transaction(async (tx) => {
      for (const [documentType, documentUrl] of Object.entries(docs)) {
        if (!documentUrl) continue;
        await tx.riderDocument.deleteMany({ where: { riderId: rider.id, documentType } });
        await tx.riderDocument.create({ data: { riderId: rider.id, documentType, documentUrl } });
      }
      await tx.rider.update({
        where: { id: rider.id },
        data: {
          city: data.city.trim(),
          vehicleType: data.vehicleType,
          vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
          licenseNumber: data.licenseNumber?.trim() || null,
          verificationStatus: 'pending',
          rejectionReason: null,
        },
      });
    });
    return this.getMyApplication(userId);
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
   * The rider's phone reports where they are while on a job. The position is kept on the job
   * (the customer sees it once the food is on its way) and checked against the two ends:
   * coming within 150 m of the kitchen, or of the customer's door, moves the job on by itself.
   * An end whose location isn't known is never guessed, so nothing is triggered for it.
   */
  async updateRiderLocation(userId: string, deliveryId: string, latitude: number, longitude: number) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new AppError('Valid numeric latitude and longitude are required', 400, 'INVALID_COORDINATES');
    }
    const rider = await this.requireRider(userId);
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'DELIVERY_NOT_FOUND');
    }
    if (delivery.riderId !== rider.id) {
      throw new AppError('This delivery is not assigned to you', 403, 'ACCESS_DENIED');
    }
    if (!ACTIVE_STATUSES.includes(delivery.status)) {
      throw new AppError('This job is finished, so its location is no longer shared', 409, 'DELIVERY_NOT_ACTIVE');
    }

    const { pickupLat, pickupLng, deliveryLat, deliveryLng } = endsOf(delivery);
    const kmTo = (lat: number | null, lng: number | null) => (lat != null && lng != null ? haversineKm(latitude, longitude, lat, lng) : null);
    const toPickupKm = kmTo(pickupLat, pickupLng);
    const toDropoffKm = kmTo(deliveryLat, deliveryLng);

    const now = new Date();
    const store = !delivery.riderLocationAt || now.getTime() - delivery.riderLocationAt.getTime() >= LOCATION_MIN_INTERVAL_MS;
    if (store) {
      await prisma.delivery.update({
        where: { id: deliveryId },
        data: { riderLatitude: latitude, riderLongitude: longitude, riderLocationAt: now },
      });
    }

    let autoTriggeredStatus: string | null = null;
    if (delivery.status === 'assigned' && toPickupKm != null && toPickupKm <= GEOFENCE_KM) autoTriggeredStatus = 'arrived_at_pickup';
    else if (delivery.status === 'in_transit' && toDropoffKm != null && toDropoffKm <= GEOFENCE_KM) autoTriggeredStatus = 'arrived_at_customer';

    let current = delivery;
    if (autoTriggeredStatus) {
      try {
        await this.updateDeliveryStatus(userId, deliveryId, autoTriggeredStatus);
      } catch (err) {
        // The rider's own tap (or a cancel) got there first: nothing left to trigger.
        const raced = err instanceof AppError && ['DELIVERY_STATUS_CONFLICT', 'INVALID_TRANSITION', 'DELIVERY_CANCELLED', 'ORDER_ALREADY_TERMINAL'].includes(err.code);
        if (!raced) throw err;
        autoTriggeredStatus = null;
      }
      current = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    }

    if (store && ON_THE_WAY_STATUSES.includes(current.status)) {
      const distanceKm = toDropoffKm != null ? Math.round(toDropoffKm * 10) / 10 : undefined;
      realtimeOrderService
        .emitDeliveryTrackingUpdate(current.orderId, { latitude, longitude }, distanceKm)
        .catch((err) => console.error('Delivery tracking update failed:', err));
    }

    return {
      delivery: formatDelivery(current),
      currentLocation: { latitude, longitude },
      distanceToPickupMeters: toPickupKm != null ? Math.round(toPickupKm * 1000) : null,
      distanceToDeliveryMeters: toDropoffKm != null ? Math.round(toDropoffKm * 1000) : null,
      isInsidePickupGeofence: toPickupKm != null && toPickupKm <= GEOFENCE_KM,
      isInsideDeliveryGeofence: toDropoffKm != null && toDropoffKm <= GEOFENCE_KM,
      autoTriggeredStatus,
    };
  }
}

export default new RiderService();

