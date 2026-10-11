import { randomInt, timingSafeEqual } from 'crypto';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { deliveryProviderOf } from '../utils/paymentCustody';

/**
 * The customer's handover code.
 *
 * Every order gets a 4-digit code that only the customer is shown (the Prisma
 * client omits it from all queries unless explicitly selected). Whoever hands
 * the order over (a Nuray rider, a self-delivering seller, a pickup counter)
 * must enter it, so an order can't be marked delivered without the customer.
 * Wrong guesses are counted on the order; after MAX_HANDOVER_ATTEMPTS the code
 * locks and support (an admin) has to complete the handover.
 */

export const MAX_HANDOVER_ATTEMPTS = 5;

export function newHandoverCode(): string {
  return String(randomInt(1000, 10000));
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Check a handover code before completing a handover. Runs in its own short
 * transaction so a wrong guess is counted even though the request is rejected.
 * `legacyCode` covers deliveries created before codes moved onto the order.
 * Orders that have no code at all (very old ones) pass.
 */
export async function verifyHandoverCode(orderId: string, supplied: string | undefined | null, legacyCode?: string | null): Promise<void> {
  const verdict = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { handoverCode: true, handoverAttempts: true },
    });
    if (!order) return 'NOT_FOUND' as const;
    const expected = order.handoverCode ?? legacyCode ?? null;
    if (!expected) return 'NO_CODE' as const;
    if (order.handoverAttempts >= MAX_HANDOVER_ATTEMPTS) return 'LOCKED' as const;
    if (supplied && sameCode(supplied.trim(), expected)) return 'OK' as const;
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { handoverAttempts: { increment: 1 } },
      select: { handoverAttempts: true },
    });
    return updated.handoverAttempts >= MAX_HANDOVER_ATTEMPTS ? ('LOCKED' as const) : ('WRONG' as const);
  });

  if (verdict === 'NOT_FOUND') throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (verdict === 'LOCKED') {
    throw new AppError(
      'Too many wrong codes. Contact Nuray support to complete this handover.',
      423,
      'HANDOVER_LOCKED'
    );
  }
  if (verdict === 'WRONG') {
    throw new AppError(
      "That code doesn't match. Ask the customer for the 4-digit code shown on their order screen.",
      400,
      'INVALID_DELIVERY_OTP'
    );
  }
}

/** What decides who may hand an order over and whether it may go out: how it is delivered and how it was paid. */
export interface HandoverOrder {
  deliveryType: string;
  deliveryProvider?: string | null;
  deliveryFeeBreakdown?: unknown;
  paymentMethod: string;
  paymentStatus: string;
}

/**
 * The rules for moving an item of an order to `toStatus` that do not depend on the customer's code: only a kitchen that
 * hands the order over itself may do it (a Nuray rider delivers the rest and enters the code), a refunded order is not
 * delivered, and a payment by transfer or card is confirmed before the food leaves the kitchen.
 *
 * They are checked before the code is looked at, because a wrong code is counted against the order (it locks after five):
 * a request that is going to be refused anyway must not use up the customer's attempts, or a kitchen whose order a rider
 * delivers could lock the rider out of it.
 */
export function assertMayHandOver(order: HandoverOrder, sellerDeliveryProvider: string | null | undefined, toStatus: string): void {
  if (toStatus === 'delivered' && ['refund_pending', 'refunded'].includes(order.paymentStatus)) {
    throw new AppError('This order has been refunded and cannot be marked delivered', 400, 'ORDER_REFUNDED');
  }
  // A Nuray rider's delivery is completed by the rider with the customer's code; a seller marking it delivered would release
  // earnings for food that may never have arrived.
  if (['dispatched', 'in_transit', 'delivered', 'delivery_failed'].includes(toStatus)) {
    const sellerHandsOver = order.deliveryType === 'self_pickup' || deliveryProviderOf(order, sellerDeliveryProvider) === 'self';
    if (!sellerHandsOver) {
      throw new AppError('A Nuray rider delivers this order. It is marked delivered when the rider hands it over.', 403, 'PLATFORM_DELIVERY');
    }
  }
  if (['ready', 'dispatched'].includes(toStatus) && order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
    throw new AppError(
      "The customer's payment hasn't been confirmed yet. Confirm (or dispute) the transfer before handing the order over.",
      409,
      'PAYMENT_NOT_CONFIRMED'
    );
  }
}
