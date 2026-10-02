import prisma from '../config/database';
import socketManager from '../config/socket';

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
export function notifyDeliveryCancelled(cancelled: CancelledDelivery | null): void {
  if (!cancelled) return;
  try {
    const payload = { deliveryId: cancelled.deliveryId, orderId: cancelled.orderId };
    if (cancelled.riderUserId) socketManager.emitToUser(cancelled.riderUserId, 'delivery:cancelled', payload);
    socketManager.emitToRole('rider', 'delivery:removed', payload);
  } catch {
    // Realtime is best-effort; the rider's next refresh shows it anyway.
  }
}
