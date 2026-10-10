import prisma from '../config/database';
import socketManager from '../config/socket';
import { notify } from './notify.service';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CancelledDelivery {
  deliveryId: string;
  orderId: string;
  riderUserId: string | null;
}

/**
 * Close the rider job of an order that has been called off, inside the caller's
 * transaction. A cancelled order used to leave its delivery 'pending' (still in the
 * rider pool) or 'assigned' forever, where it counted against the rider's two-job
 * limit and could never be finished. Returns who to tell (see notifyDeliveryCancelled).
 */
export async function cancelOpenDelivery(tx: Tx, orderId: string, reason: string): Promise<CancelledDelivery | null> {
  const delivery = await tx.delivery.findUnique({
    where: { orderId },
    select: { id: true, status: true, rider: { select: { userId: true } } },
  });
  if (!delivery || ['delivered', 'cancelled'].includes(delivery.status)) return null;
  await tx.delivery.update({
    where: { id: delivery.id },
    data: { status: 'cancelled', deliveryNotes: `Cancelled: ${reason}`.slice(0, 500) },
  });
  return { deliveryId: delivery.id, orderId, riderUserId: delivery.rider?.userId ?? null };
}

/** After the commit: tell the assigned rider (and the rider pool) the job is gone. */
/**
 * What a job looks like when it goes back to the pool: no rider, no pay or bonus set for one,
 * nothing of the previous rider's trip (arrival times, last position, pickup time) left on it,
 * and the rider who had it on the list of riders it is not offered to again.
 */
export function reopenDeliveryData(previousRiderId?: string | null) {
  return {
    riderId: null,
    status: 'pending' as const,
    riderFee: null,
    riderBonus: null,
    assignmentMode: null,
    arrivedAtPickup: null,
    arrivedAtCustomer: null,
    pickupTime: null,
    riderLatitude: null,
    riderLongitude: null,
    riderLocationAt: null,
    ...(previousRiderId ? { releasedRiderIds: { push: previousRiderId } } : {}),
  };
}

export function notifyDeliveryCancelled(cancelled: CancelledDelivery | null): void {
  if (!cancelled) return;
  try {
    const payload = { deliveryId: cancelled.deliveryId, orderId: cancelled.orderId };
    if (cancelled.riderUserId) socketManager.emitToUser(cancelled.riderUserId, 'delivery:cancelled', payload);
    socketManager.emitToOnDutyRiders('delivery:removed', payload);
  } catch {
    // Realtime is best-effort; the rider's next refresh shows it anyway.
  }
  // The assigned rider may be on the road towards it: tell their phone too.
  if (cancelled.riderUserId) {
    const riderUserId = cancelled.riderUserId;
    void prisma.order
      .findUnique({ where: { id: cancelled.orderId }, select: { orderNumber: true } })
      .then((order) =>
        notify({
          userId: riderUserId,
          category: 'deliveries',
          type: 'delivery',
          title: 'Job cancelled',
          message: `Order #${order?.orderNumber ?? ''} was cancelled. Don't pick it up; if you already have the food, contact support.`,
          actionUrl: '/riders/dashboard',
          data: { orderId: cancelled.orderId, deliveryId: cancelled.deliveryId },
          channels: ['push'],
          dedupeKey: `delivery:${cancelled.deliveryId}:cancelled`,
        })
      )
      .catch(() => undefined);
  }
}
