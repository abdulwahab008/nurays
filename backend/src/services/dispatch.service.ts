import prisma from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import socketManager from '../config/socket';
import realtimeOrderService from './realtime-order.service';
import { notify } from './notify.service';
import { cashLimitOf, riderMoney, riderMoneyMany } from './rider-ledger.service';
import { calculateDeliveryFeeCorridor } from '../utils/deliveryFee';
import { assignmentMessage, cashToCollect, dropoffAreaOf, endsOf, routeMatch } from '../utils/riderJobs';
import { cashAtDoor, isCashAtDoor } from '../utils/paymentCustody';
import { chooseRider, DispatchCandidate, JobEnds, MAX_ACTIVE_JOBS } from '../utils/dispatch';
import { ON_DUTY_RIDER } from '../utils/riderDuty';

/**
 * Automatic assignment of delivery jobs to Nuray's own riders (see utils/dispatch.ts for the rules).
 * A job that nobody can take stays in the open pool, where any rider can still claim it, and is
 * tried again every minute and whenever a rider frees up or goes on duty.
 */
export const autoAssignEnabled = () => process.env.AUTO_ASSIGN_ENABLED !== 'false';

const ACTIVE = ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'];
const LIVE_ORDER_NOT = ['cancelled', 'refunded', 'delivered', 'completed'];

const JOB_INCLUDE = {
  order: {
    select: {
      orderNumber: true,
      orderStatus: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      deliveryAddress: { select: { communityId: true, area: true, city: true } },
      deliveryAddressSnapshot: true,
      items: { select: { status: true, seller: { select: { communityId: true } } }, take: 5 },
    },
  },
} as const;

export type JobRow = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

function loadJob(deliveryId: string) {
  return prisma.delivery.findUnique({ where: { id: deliveryId }, include: JOB_INCLUDE });
}

function endsWithCommunities(d: {
  pickupLatitude: unknown;
  pickupLongitude: unknown;
  deliveryLatitude: unknown;
  deliveryLongitude: unknown;
  order: { deliveryAddress: { communityId: string | null } | null; items: Array<{ status: string; seller: { communityId: string | null } | null }> };
}): JobEnds {
  const e = endsOf(d);
  const live = d.order.items.find((i) => i.status !== 'cancelled') ?? d.order.items[0];
  return {
    pickup: { lat: e.pickupLat, lng: e.pickupLng },
    dropoff: { lat: e.deliveryLat, lng: e.deliveryLng },
    pickupCommunityId: live?.seller?.communityId ?? null,
    dropoffCommunityId: d.order.deliveryAddress?.communityId ?? null,
  };
}

export interface DispatchResult {
  assigned: boolean;
  riderId?: string;
  reason?: string;
}

/**
 * Try to give one open job to the best rider. Safe to call repeatedly and concurrently.
 * `announced` says whether the riders were already told the job is in the pool (the default); when it is
 * not, taking it needs no "gone from the pool" message to them.
 */
export async function dispatchDelivery(deliveryId: string, opts: { announced?: boolean } = {}): Promise<DispatchResult> {
  if (!autoAssignEnabled()) return { assigned: false, reason: 'disabled' };
  const job = await loadJob(deliveryId);
  if (!job || job.riderId || job.status !== 'pending') return { assigned: false, reason: 'not_open' };
  if (LIVE_ORDER_NOT.includes(job.order.orderStatus)) return { assigned: false, reason: 'order_finished' };

  const riders = await prisma.rider.findMany({
    where: { ...ON_DUTY_RIDER, id: { notIn: job.releasedRiderIds } },
    select: { id: true, userId: true, communityId: true, cashLimit: true },
  });
  if (riders.length === 0) return { assigned: false, reason: 'no_riders' };

  const riderIds = riders.map((r) => r.id);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [activeJobs, doneToday, moneyByRider] = await Promise.all([
    prisma.delivery.findMany({ where: { riderId: { in: riderIds }, status: { in: ACTIVE } }, include: JOB_INCLUDE }),
    prisma.delivery.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds }, status: 'delivered', deliveryTime: { gte: startOfDay } }, _count: { _all: true } }),
    riderMoneyMany(prisma, riderIds),
  ]);

  const candidates: DispatchCandidate[] = [];
  for (const r of riders) {
    const mine = activeJobs.filter((d) => d.riderId === r.id);
    const cashHeld = moneyByRider.get(r.id)?.cashHeld ?? 0;
    candidates.push({
      id: r.id,
      communityId: r.communityId,
      active: mine.map(endsWithCommunities),
      cashHeld,
      cashToCollect: cashToCollect(mine),
      cashLimit: cashLimitOf(r),
      deliveriesToday: doneToday.find((d) => d.riderId === r.id)?._count._all ?? 0,
    });
  }

  const cod = isCashAtDoor(job.order);
  const choice = chooseRider(
    { ...endsWithCommunities(job), cashToTake: cashAtDoor(job.order) },
    candidates
  );
  if (!choice) {
    logger.debug({ deliveryId, candidates: riders.length }, 'Delivery left in the open pool: no rider can take it');
    return { assigned: false, reason: 'no_eligible_rider' };
  }

  const rider = riders.find((r) => r.id === choice.riderId)!;
  const e = endsOf(job);
  const corridor = calculateDeliveryFeeCorridor(e.pickupLat, e.pickupLng, e.deliveryLat, e.deliveryLng);

  // One assignment at a time per rider (their row locked), re-checking what the choice assumed.
  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM riders WHERE id = ${rider.id} FOR UPDATE`;
    const fresh = await tx.rider.findUnique({ where: { id: rider.id }, select: { isAvailable: true, status: true, cashLimit: true } });
    if (!fresh || !fresh.isAvailable || fresh.status !== 'active') return false;
    const active = await tx.delivery.findMany({ where: { riderId: rider.id, status: { in: ACTIVE } }, include: { order: { select: { paymentMethod: true, paymentStatus: true, totalAmount: true } } } });
    if (active.length >= MAX_ACTIVE_JOBS) return false;
    if (cod) {
      const { cashHeld } = await riderMoney(tx, rider.id);
      if (cashHeld + cashToCollect(active) + Number(job.order.totalAmount) > cashLimitOf(fresh)) return false;
    }
    const bonus = routeMatch(active.length === 1 ? active[0] : null, job)?.bonus ?? 0;
    const claimed = await tx.delivery.updateMany({
      where: { id: deliveryId, riderId: null, status: 'pending' },
      data: { riderId: rider.id, status: 'assigned', riderFee: corridor.standardFee, riderBonus: bonus, assignmentMode: 'auto' },
    });
    return claimed.count === 1 ? { bonus } : false;
  });
  if (!done) return { assigned: false, reason: 'lost_race' };

  logger.info({ deliveryId, orderId: job.orderId, riderId: rider.id, reason: choice.reason, candidates: riders.length, bonus: done.bonus }, 'Delivery auto-assigned');
  await announceAssignment(job, rider.userId, corridor.standardFee + done.bonus, opts.announced !== false);
  return { assigned: true, riderId: rider.id, reason: choice.reason };
}

export async function announceAssignment(job: JobRow, riderUserId: string, riderPay: number, announced = true) {
  void realtimeOrderService.emitDeliveryClaimed(job.id, job.orderId, { toRiders: announced });
  const cash = cashAtDoor(job.order);
  const activeNow = await prisma.delivery.count({ where: { rider: { userId: riderUserId }, status: { in: ACTIVE } } });
  socketManager.emitToUser(riderUserId, 'delivery:assigned', { deliveryId: job.id, orderId: job.orderId });
  // The rider's screen pops this up, even while they are already carrying another job.
  socketManager.emitToUser(riderUserId, 'delivery:offered', {
    deliveryId: job.id,
    orderId: job.orderId,
    orderNumber: job.order.orderNumber,
    pickupAddress: job.pickupAddress,
    deliveryAddress: job.deliveryAddress,
    cashToCollect: Math.round(cash), // the pop-up shows whole rupees
    riderFee: riderPay,
    activeJobs: activeNow,
    mode: 'auto',
  });
  await notify({
    userId: riderUserId,
    category: 'deliveries',
    type: 'delivery',
    title: 'New delivery assigned to you',
    // Stored and pushed: the area only. The street is in the job, which the rider can open while it is theirs.
    message: assignmentMessage({
      orderNumber: job.order.orderNumber,
      pickupAddress: job.pickupAddress,
      dropoffArea: dropoffAreaOf(job.order),
      cashToCollect: cash,
    }),
    actionUrl: '/riders/dashboard#active',
    data: { deliveryId: job.id, orderId: job.orderId },
    channels: ['push'],
    dedupeKey: `delivery-assigned:${job.id}:${riderUserId}`,
  });
}

/** An admin sets which community a rider serves (null: none). New jobs there go to them first. */
export async function setRiderCommunity(riderId: string, communityId: string | null) {
  if (communityId) {
    const community = await prisma.community.findUnique({ where: { id: communityId }, select: { id: true } });
    if (!community) throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
  }
  const updated = await prisma.rider.updateMany({ where: { id: riderId }, data: { communityId } });
  if (updated.count === 0) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
  dispatchSoon();
  return { communityId };
}

/** Try every open job (oldest first). Used by the one-minute sweep and when a rider frees up. */
export async function dispatchWaiting(limit = 50): Promise<number> {
  if (!autoAssignEnabled()) return 0;
  const open = await prisma.delivery.findMany({
    where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: LIVE_ORDER_NOT } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  let assigned = 0;
  for (const { id } of open) {
    try {
      if ((await dispatchDelivery(id)).assigned) assigned++;
    } catch (err) {
      logger.error({ err, deliveryId: id }, 'Dispatch failed');
    }
  }
  return assigned;
}

/** Fire and forget: dispatching must never fail what triggered it. */
export function dispatchSoon(deliveryId?: string) {
  const run = deliveryId ? dispatchDelivery(deliveryId) : dispatchWaiting();
  void run.catch((err) => logger.error({ err }, 'Dispatch failed'));
}

/**
 * A job has just joined the open pool (a new one, one handed back, one reopened by an admin). It is
 * offered to the best rider first: when a rider takes it, no other rider ever hears of it, so a busy
 * hour does not make every connected rider reload their lists twice per order. Only a job nobody
 * could take is announced to every rider, who can then claim it by hand. The dispatcher is a
 * parameter so the choice can be tested without a database.
 */
export async function postDelivery(
  deliveryId: string,
  orderId: string,
  dispatch: (id: string, opts: { announced: boolean }) => Promise<DispatchResult> = dispatchDelivery
): Promise<void> {
  let taken = false;
  try {
    taken = (await dispatch(deliveryId, { announced: false })).assigned;
  } catch (err) {
    logger.error({ err, deliveryId }, 'Dispatch failed');
  }
  if (!taken) realtimeOrderService.emitDeliveryPosted(deliveryId, orderId);
}

/** Fire and forget: posting a job must never fail what triggered it. */
export function postDeliverySoon(deliveryId: string, orderId: string) {
  void postDelivery(deliveryId, orderId).catch((err) => logger.error({ err, deliveryId }, 'Posting a delivery failed'));
}
