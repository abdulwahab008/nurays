/**
 * Netting, and the pause on cash orders for a kitchen that owes Nuray.
 *
 * A kitchen that takes cash itself (its own delivery, a pickup) keeps the whole order and owes Nuray the commission.
 * That is netted automatically: the balance (seller-balance.service.ts) takes what the kitchen owes off what Nuray
 * owes it for online orders, so a kitchen with online orders pays its commission without doing anything. Only when
 * the cash side is bigger does the balance go below zero, and then the kitchen owes Nuray.
 *
 * The same balance carries refunds Nuray paid a customer for money the kitchen holds (a transfer into its account,
 * cash it took), so that debt is limited too.
 *
 * `owes_since` records since when. Fourteen days on (CASH_PAUSE_AFTER_DAYS), or at once when the kitchen owes more than
 * the limit (KITCHEN_OWING_LIMIT, Rs 5,000 unless set), new orders whose money the kitchen would take itself are
 * refused: cash it collects, and transfers into its own account. Online payment, and cash a Nuray rider collects,
 * still work, and both bring the balance back up. The pause lifts the moment the balance is back within the limit
 * (or, after fourteen days, to zero): from online orders netting it off, or from an admin recording that the kitchen
 * paid Nuray.
 */
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { roundMoney } from '../utils/pricing';
import { pktDate } from '../utils/payoutWeek';
import { logger } from '../utils/logger';
import { computeSellerBalance } from './seller-balance.service';
import { notify, notifyMany } from './notify.service';
import { notificationText } from '../utils/notificationText';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Client = typeof prisma | Tx;

export const CASH_PAUSE_AFTER_DAYS = 14;
/** The most a kitchen may owe Nuray and still take customers' money itself. */
export const owingLimit = (env: NodeJS.ProcessEnv = process.env): number =>
  Number(env.KITCHEN_OWING_LIMIT) > 0 ? Number(env.KITCHEN_OWING_LIMIT) : 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OwingState {
  /** What the kitchen owes Nuray now (0 when it owes nothing). */
  owed: number;
  owesSince: Date | null;
  /** When its cash orders pause (or paused) for owing too long. */
  cashPausesAt: Date | null;
  /** The kitchen takes no customer money itself now (cash it collects, transfers to its account): it has owed too long or too much. */
  cashPaused: boolean;
  overLimit: boolean;
}

export function owingState(available: number, owesSince: Date | null, now: Date = new Date()): OwingState {
  const owed = available < 0 ? roundMoney(-available) : 0;
  const overLimit = owed > owingLimit();
  if (owed === 0 || !owesSince) return { owed, owesSince: owed === 0 ? null : owesSince, cashPausesAt: null, cashPaused: overLimit, overLimit };
  const cashPausesAt = new Date(owesSince.getTime() + CASH_PAUSE_AFTER_DAYS * DAY_MS);
  return { owed, owesSince, cashPausesAt, cashPaused: overLimit || now >= cashPausesAt, overLimit };
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
 * At checkout: may this kitchen take the money for an order itself (cash it collects, a transfer into its account)?
 * Cheap when it owes nothing (no balance is worked out); a kitchen that owes has its balance checked again first,
 * since online orders may have paid it off.
 */
export async function assertKitchenTakesCash(sellerId: string, now: Date = new Date()): Promise<void> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { owesSince: true } });
  if (!seller?.owesSince) return;
  const state = await refreshOwing(prisma, sellerId, now);
  if (state.cashPaused) {
    throw new AppError("This kitchen can't take cash or direct transfers right now. Please pay online.", 409, 'CASH_UNAVAILABLE');
  }
}

/** Every approved kitchen's `owes_since`, brought up to date (scheduled), with a reminder to each that owes. */
export async function refreshAllOwing(now: Date = new Date()): Promise<{ owing: number; paused: number }> {
  const sellers = await prisma.seller.findMany({ where: { verificationStatus: 'approved' }, select: { id: true, userId: true, businessName: true } });
  const admins = (await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } })).map((a) => a.id);
  let owing = 0;
  let paused = 0;
  for (const s of sellers) {
    try {
      const state = await refreshOwing(prisma, s.id, now);
      if (state.owed === 0) continue;
      owing++;
      if (state.cashPaused) {
        paused++;
        await notifyMany(admins, () => ({
          category: 'payments',
          type: 'payout',
          text: notificationText('admin.kitchenPaused', { kitchen: s.businessName, owed: `Rs ${state.owed.toLocaleString('en-PK')}` }),
          actionUrl: '/admin/payouts',
          // Once for each time a kitchen starts owing, not on every run.
          dedupeKey: `owing-paused:${s.id}:${state.owesSince?.toISOString() ?? ''}`,
        }));
      }
      // One reminder a day at most, and it says what happens when.
      await notify({
        userId: s.userId,
        category: 'payments',
        type: 'payout',
        text: state.cashPaused
          ? notificationText('owing.cashPaused', { owed: `Rs ${state.owed.toLocaleString('en-PK')}` })
          : notificationText('owing.reminder', { owed: `Rs ${state.owed.toLocaleString('en-PK')}`, pausesOn: pktDate(state.cashPausesAt!) }),
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
      text: notificationText('owing.paid', {
        amount: `Rs ${amount.toLocaleString('en-PK')}`,
        stillOwed: row.state.owed === 0 ? null : `Rs ${row.state.owed.toLocaleString('en-PK')}`,
      }),
      actionUrl: '/sellers/earnings',
      dedupeKey: `paid-nuray:${row.created.id}`,
    });
  }
  return { paymentId: row.created.id, amount, ...row.state };
}
