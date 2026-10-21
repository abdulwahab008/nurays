/**
 * Netting, and the pause on cash orders for a kitchen that owes Nuray.
 *
 * A kitchen that takes cash itself (its own delivery, a pickup) keeps the whole order and owes Nuray the commission.
 * That is netted automatically: the balance (seller-balance.service.ts) takes what the kitchen owes off what Nuray
 * owes it for online orders, so a kitchen with online orders pays its commission without doing anything. Only when
 * the cash side is bigger does the balance go below zero, and then the kitchen owes Nuray.
 *
 * `owes_since` records since when. Fourteen days on (CASH_PAUSE_AFTER_DAYS), new orders paid in cash the kitchen would
 * take itself are refused; online payment, and cash a Nuray rider collects, still work, and both bring the balance
 * back up. The pause lifts the moment the balance is back to zero or more: from online orders netting it off, or
 * from an admin recording that the kitchen paid Nuray.
 */
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { roundMoney } from '../utils/pricing';
import { pktDate } from '../utils/payoutWeek';
import { logger } from '../utils/logger';
import { computeSellerBalance } from './seller-balance.service';
import { notify } from './notify.service';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Client = typeof prisma | Tx;

export const CASH_PAUSE_AFTER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OwingState {
  /** What the kitchen owes Nuray now (0 when it owes nothing). */
  owed: number;
  owesSince: Date | null;
  /** When its cash orders pause (or paused). */
  cashPausesAt: Date | null;
  cashPaused: boolean;
}

export function owingState(available: number, owesSince: Date | null, now: Date = new Date()): OwingState {
  const owed = available < 0 ? roundMoney(-available) : 0;
  if (owed === 0 || !owesSince) return { owed, owesSince: owed === 0 ? null : owesSince, cashPausesAt: null, cashPaused: false };
  const cashPausesAt = new Date(owesSince.getTime() + CASH_PAUSE_AFTER_DAYS * DAY_MS);
  return { owed, owesSince, cashPausesAt, cashPaused: now >= cashPausesAt };
}

/** Bring `owes_since` in line with the balance: set when the kitchen starts owing, cleared when it no longer does. */
export async function refreshOwing(client: Client, sellerId: string, now: Date = new Date(), knownAvailable?: number): Promise<OwingState> {
  const [seller, available] = await Promise.all([
    client.seller.findUnique({ where: { id: sellerId }, select: { owesSince: true } }),
    knownAvailable ?? computeSellerBalance(client, sellerId).then((b) => b.available),
  ]);
  if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
  const owes = available < 0;
  let owesSince = seller.owesSince;
  if (owes && !owesSince) {
    owesSince = now;
    await client.seller.update({ where: { id: sellerId }, data: { owesSince } });
  } else if (!owes && owesSince) {
    owesSince = null;
    await client.seller.update({ where: { id: sellerId }, data: { owesSince: null } });
  }
  return owingState(available, owesSince, now);
}

/**
 * At checkout: may this kitchen take a cash order it collects itself? Cheap when it owes nothing (no balance is
 * worked out); when the pause would apply the balance is checked again first, since online orders may have paid it off.
 */
export async function assertKitchenTakesCash(sellerId: string, now: Date = new Date()): Promise<void> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { owesSince: true } });
  if (!seller?.owesSince || now.getTime() - seller.owesSince.getTime() < CASH_PAUSE_AFTER_DAYS * DAY_MS) return;
  const state = await refreshOwing(prisma, sellerId, now);
  if (state.cashPaused) {
    throw new AppError("This kitchen can't take cash orders right now. Please pay online.", 409, 'CASH_UNAVAILABLE');
  }
}

/** Every approved kitchen's `owes_since`, brought up to date (scheduled), with a reminder to each that owes. */
export async function refreshAllOwing(now: Date = new Date()): Promise<{ owing: number; paused: number }> {
  const sellers = await prisma.seller.findMany({ where: { verificationStatus: 'approved' }, select: { id: true, userId: true } });
  let owing = 0;
  let paused = 0;
  for (const s of sellers) {
    try {
      const state = await refreshOwing(prisma, s.id, now);
      if (state.owed === 0) continue;
      owing++;
      if (state.cashPaused) paused++;
      // One reminder a day at most, and it says what happens when.
      await notify({
        userId: s.userId,
        category: 'payments',
        type: 'payout',
        title: state.cashPaused ? 'Cash orders are paused' : 'You owe Nuray commission',
        message: state.cashPaused
          ? `You owe Nuray Rs ${state.owed.toLocaleString('en-PK')}. New cash orders are paused until it is paid; online orders still come in and pay it off.`
          : `You owe Nuray Rs ${state.owed.toLocaleString('en-PK')} in commission on cash orders. It is taken from your online earnings; if it is still owed on ${pktDate(state.cashPausesAt!)}, cash orders pause until it is paid.`,
        actionUrl: '/sellers/earnings',
        dedupeKey: `owing:${s.id}:${pktDate(now)}`,
      });
    } catch (err) {
      logger.error({ err, sellerId: s.id }, 'Could not bring a kitchen owing state up to date');
    }
  }
  return { owing, paused };
}

/** Kitchens that owe Nuray now, longest owing first (for the admin's payouts screen). */
export async function listOwingKitchens(now: Date = new Date()) {
  const sellers = await prisma.seller.findMany({
    where: { owesSince: { not: null } },
    select: { id: true, businessName: true },
    orderBy: { owesSince: 'asc' },
  });
  const rows = [];
  for (const s of sellers) {
    const state = await refreshOwing(prisma, s.id, now);
    if (state.owed > 0) rows.push({ sellerId: s.id, businessName: s.businessName, ...state });
  }
  return rows;
}

/**
 * An admin records that a kitchen paid Nuray what it owed (cash, a transfer into Nuray's account). Kept as a completed
 * payout with a negative amount and method 'paid_to_nuray', so the balance, the payout history and the audit trail
 * all see it. It may not be more than the kitchen owes.
 */
export async function recordPaymentToNuray(input: { sellerId: string; amount: number; reference: string; adminId: string; ip?: string | null }) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new AppError('Enter the amount the kitchen paid', 400, 'INVALID_AMOUNT');
  const today = new Date(`${pktDate(new Date())}T00:00:00Z`);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${input.sellerId} FOR NO KEY UPDATE`;
    const seller = await tx.seller.findUnique({ where: { id: input.sellerId }, select: { id: true } });
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    const balance = await computeSellerBalance(tx, input.sellerId);
    const owed = balance.available < 0 ? roundMoney(-balance.available) : 0;
    if (amount > owed + 0.005) {
      throw new AppError(`The kitchen owes Rs ${owed.toLocaleString('en-PK')}; a payment cannot be more than that`, 400, 'AMOUNT_EXCEEDS_OWED');
    }
    const created = await tx.sellerPayout.create({
      data: {
        sellerId: input.sellerId,
        amount: -amount,
        commissionDeducted: 0,
        netAmount: -amount,
        payoutMethod: 'paid_to_nuray',
        accountDetails: { reference: input.reference, recordedBy: input.adminId },
        status: 'completed',
        transactionId: input.reference,
        periodStart: today,
        periodEnd: today,
        processedAt: new Date(),
      },
    });
    const state = await refreshOwing(tx, input.sellerId);
    return { created, state };
  });
  void recordAudit({
    userId: input.adminId,
    action: 'admin:KITCHEN_PAID_NURAY',
    entityType: 'seller_payout',
    entityId: row.created.id,
    ipAddress: input.ip ?? null,
    data: { sellerId: input.sellerId, amount, reference: input.reference },
    responseStatus: 201,
  });
  const owner = await prisma.seller.findUnique({ where: { id: input.sellerId }, select: { userId: true } });
  if (owner) {
    await notify({
      userId: owner.userId,
      category: 'payments',
      type: 'payout',
      title: 'Payment to Nuray received',
      message: `We received your payment of Rs ${amount.toLocaleString('en-PK')}.${row.state.owed === 0 ? ' You owe nothing now, and cash orders are open.' : ` Still owed: Rs ${row.state.owed.toLocaleString('en-PK')}.`}`,
      actionUrl: '/sellers/earnings',
      dedupeKey: `paid-nuray:${row.created.id}`,
    });
  }
  return { paymentId: row.created.id, amount, ...row.state };
}
