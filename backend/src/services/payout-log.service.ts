import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { notificationText } from '../utils/notificationText';
import { notify } from './notify.service';

/**
 * The payout log: every step of every kitchen payout, appended and never changed (a database trigger refuses updates
 * and deletes). Created (by the daily run or the kitchen's request), sent (with the bank or wallet reference, by
 * which admin), approved by a second admin (a large payout), failed (and why), a payment the kitchen made to Nuray, and the kitchen's own answer once the money is
 * sent: received, or not received (which alerts the admins).
 */

export type PayoutEventType = 'created' | 'approved' | 'sent' | 'failed' | 'received' | 'not_received' | 'payment_received';
export type ActorType = 'system' | 'admin' | 'kitchen';

type Db = typeof prisma | Prisma.TransactionClient;

export function logPayoutEvent(
  db: Db,
  e: { payoutId: string; event: PayoutEventType; actorType: ActorType; actorId?: string | null; reference?: string | null; note?: string | null }
) {
  return db.payoutEvent.create({
    data: { payoutId: e.payoutId, event: e.event, actorType: e.actorType, actorId: e.actorId ?? null, reference: e.reference ?? null, note: e.note ?? null },
  });
}

export async function payoutEvents(payoutIds: string[]) {
  const rows = await prisma.payoutEvent.findMany({ where: { payoutId: { in: payoutIds } }, orderBy: { createdAt: 'asc' } });
  const byPayout = new Map<string, Array<{ event: string; actorType: string; actorId: string | null; reference: string | null; note: string | null; at: Date }>>();
  for (const r of rows) {
    if (!byPayout.has(r.payoutId)) byPayout.set(r.payoutId, []);
    byPayout.get(r.payoutId)!.push({ event: r.event, actorType: r.actorType, actorId: r.actorId, reference: r.reference, note: r.note, at: r.createdAt });
  }
  return byPayout;
}

/**
 * The kitchen answers whether a sent payout reached its account. Only a sent payout, once; "not received" asks for a
 * note and alerts every admin, who can check with the bank using the reference.
 */
export async function confirmPayout(sellerId: string, userId: string, payoutId: string, answer: 'received' | 'not_received', note?: string) {
  const why = note?.trim() || null;
  if (answer === 'not_received' && (!why || why.length < 3)) throw new AppError('Tell us what you see in your account', 400, 'NOTE_REQUIRED');
  const payout = await prisma.$transaction(async (tx) => {
    const claimed = await tx.sellerPayout.updateMany({
      where: { id: payoutId, sellerId, status: 'completed', netAmount: { gt: 0 }, kitchenConfirmation: null },
      data: { kitchenConfirmation: answer, kitchenConfirmedAt: new Date() },
    });
    if (claimed.count === 0) throw new AppError('This payout is not waiting for your answer', 409, 'PAYOUT_NOT_CONFIRMABLE');
    await logPayoutEvent(tx, { payoutId, event: answer, actorType: 'kitchen', actorId: userId, note: why });
    return tx.sellerPayout.findUnique({ where: { id: payoutId }, include: { seller: { select: { businessName: true } } } });
  });
  void recordAudit({ userId, action: `payout:KITCHEN_${answer.toUpperCase()}`, entityType: 'seller_payout', entityId: payoutId, data: { note: why }, responseStatus: 200 });
  if (answer === 'not_received' && payout) {
    const admins = await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } });
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        category: 'payments',
        type: 'payout',
        text: notificationText('admin.payoutNotReceived', { kitchen: payout.seller.businessName, amount: `Rs ${Number(payout.netAmount).toLocaleString('en-PK')}`, reference: payout.transactionId ?? 'no reference' }),
        actionUrl: '/admin/payouts',
        dedupeKey: `payout:${payoutId}:not-received:${admin.id}`,
      });
    }
  }
  return { payoutId, kitchenConfirmation: answer };
}
