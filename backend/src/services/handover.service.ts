import { randomInt, timingSafeEqual } from 'crypto';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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
