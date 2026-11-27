/**
 * Kitchen payouts (every working day) and payout statements, and the daily "pay due" notice for riders.
 *
 * Every working day (Monday to Friday, except the holidays an admin lists in the payoutHolidays setting) from 06:00
 * Pakistan time, each approved, active kitchen whose balance reaches its minimum gets a payout of its whole balance,
 * for everything up to the end of the day before (Monday's run covers the weekend), to the first account it has
 * saved (bank, then JazzCash, then EasyPaisa; its payout schedule's method first when it has one). A kitchen that
 * already has a payout waiting keeps that one instead. The money is still sent by an admin, who marks the payout
 * completed as before; "Withdraw now" stays for a kitchen that wants its money the same day. The job runs every hour
 * and makes at most one payout per kitchen per day, so a missed hour or a restart catches up (utils/payoutWeek.ts).
 * WEEKLY_PAYOUTS_ENABLED=false keeps the job from being scheduled at all (test servers); an admin turns automatic
 * payouts off with the weeklyPayouts setting (its name is older than the daily schedule).
 *
 * Riders have no payout account in the app: their pay is in the rider ledger and an admin pays it from the rider's
 * page. The same run tells each rider Nuray owes money to that it is due today, and the admins how many and how much.
 *
 * A statement lists the orders a payout covers: those delivered in its period before the payout was made, each with what it added to (or, for
 * money the kitchen collected itself, took from) what Nuray owes the kitchen. What the period's orders do not explain
 * (the balance carried from before, cash a rider handed in late, a refund) is shown as one line, so the statement adds
 * up to the payout.
 */
import { Prisma } from '@prisma/client';
import { toCsv } from '../utils/csv';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { logger } from '../utils/logger';
import { roundMoney } from '../utils/pricing';
import { normalizePayoutDestination, type PayoutMethod } from '../utils/payoutAccount';
import { PAYOUT_METHOD_ORDER, addDays, payoutDay, pktDate } from '../utils/payoutWeek';
import { computeSellerBalance, sellerBalanceLines, type BalanceLine } from './seller-balance.service';
import { riderMoney } from './rider-ledger.service';
import { logPayoutEvent } from './payout-log.service';
import { notify } from './notify.service';
import adminService from './admin.service';
import { notificationText } from '../utils/notificationText';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface PayoutAccountFields {
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  bankName: string | null;
  jazzcashNumber: string | null;
  jazzcashAccountTitle: string | null;
  easypaisaNumber: string | null;
  easypaisaAccountTitle: string | null;
}

export interface PayoutDestination {
  payoutMethod: PayoutMethod;
  accountNumber: string;
  accountTitle: string | null;
  bankName?: string | null;
}

/** Where a kitchen's automatic payout goes: the first saved account that is a valid one, the preferred method first. */
export function payoutDestination(seller: PayoutAccountFields, preferred?: string | null): PayoutDestination | null {
  const order = [...PAYOUT_METHOD_ORDER].sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));
  for (const method of order) {
    const raw = method === 'bank_transfer' ? seller.bankAccountNumber : method === 'jazzcash' ? seller.jazzcashNumber : seller.easypaisaNumber;
    const accountNumber = raw ? normalizePayoutDestination(method, raw) : null;
    if (!accountNumber) continue;
    if (method === 'bank_transfer') return { payoutMethod: method, accountNumber, accountTitle: seller.bankAccountName, bankName: seller.bankName };
    return { payoutMethod: method, accountNumber, accountTitle: method === 'jazzcash' ? seller.jazzcashAccountTitle : seller.easypaisaAccountTitle };
  }
  return null;
}

/**
 * A payout waits this long after a kitchen's payout account number changes: if someone else changed it, the kitchen
 * (told at once) has time to say so before any money goes there.
 */
export const PAYOUT_ACCOUNT_HOLD_HOURS = 48;

/** Until when a kitchen's payouts wait after an account change, or null when they don't. */
export function payoutHoldUntil(changedAt: Date | null, now = new Date()): Date | null {
  if (!changedAt) return null;
  const until = new Date(changedAt.getTime() + PAYOUT_ACCOUNT_HOLD_HOURS * 3600e3);
  return until > now ? until : null;
}

/** The first day a new payout covers: the day after the last payout's period (failed ones aside), else the day the kitchen joined. */
export async function nextPeriodStart(client: Tx | typeof prisma, sellerId: string, joinedAt: Date): Promise<Date> {
  const last = await client.sellerPayout.findFirst({
    where: { sellerId, status: { not: 'failed' }, amount: { gt: 0 } },
    orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
    select: { periodEnd: true },
  });
  const from = last ? addDays(last.periodEnd.toISOString().slice(0, 10), 1) : pktDate(joinedAt);
  return new Date(`${from}T00:00:00Z`);
}

export type PayoutSkip = 'opted_out' | 'no_account' | 'account_hold' | 'payout_waiting' | 'already_paid' | 'below_minimum';

export interface PayoutRunResult {
  runDate: string;
  ran: boolean;
  created: Array<{ sellerId: string; payoutId: string; amount: number }>;
  skipped: Record<PayoutSkip, number>;
  /** Riders told their pay is due today. */
  ridersDue: Array<{ riderId: string; amount: number }>;
}

/** Make today's payouts (nothing on a weekend or listed holiday, before 06:00, or when an admin switched automatic payouts off). */
export async function runDailyPayouts(now: Date = new Date()): Promise<PayoutRunResult> {
  const holidays = (await adminService.getSettingValue<string[]>('payoutHolidays')) ?? [];
  const week = payoutDay(now, Array.isArray(holidays) ? holidays : []);
  const result: PayoutRunResult = {
    runDate: week.runDate,
    ran: false,
    created: [],
    skipped: { opted_out: 0, no_account: 0, account_hold: 0, payout_waiting: 0, already_paid: 0, below_minimum: 0 },
    ridersDue: [],
  };
  if (!week.due || (await adminService.getSettingValue<boolean>('weeklyPayouts')) === false) return result;
  result.ran = true;
  const defaultMinimum = Number(await adminService.getSettingValue<number>('minPayoutAmount'));

  const sellers = await prisma.seller.findMany({
    where: { status: 'active', verificationStatus: 'approved' },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      bankAccountNumber: true,
      bankAccountName: true,
      bankName: true,
      jazzcashNumber: true,
      jazzcashAccountTitle: true,
      easypaisaNumber: true,
      easypaisaAccountTitle: true,
      payoutAccountChangedAt: true,
      payoutSchedule: { select: { autoPayout: true, payoutMethod: true, minimumPayoutAmount: true } },
    },
  });

  for (const seller of sellers) {
    // A kitchen with no schedule row is paid automatically; one that has a row follows its own switch.
    if (seller.payoutSchedule && !seller.payoutSchedule.autoPayout) {
      result.skipped.opted_out++;
      continue;
    }
    const destination = payoutDestination(seller, seller.payoutSchedule?.payoutMethod);
    if (!destination) {
      result.skipped.no_account++;
      continue;
    }
    if (payoutHoldUntil(seller.payoutAccountChangedAt, now)) {
      result.skipped.account_hold++;
      continue;
    }
    const minimum = seller.payoutSchedule ? Number(seller.payoutSchedule.minimumPayoutAmount) : defaultMinimum;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // The same lock a "withdraw now" request takes, so the two cannot both spend the balance.
        await tx.$queryRaw`SELECT id FROM sellers WHERE id = ${seller.id} FOR NO KEY UPDATE`;
        const waiting = await tx.sellerPayout.count({ where: { sellerId: seller.id, status: { in: ['pending', 'processing'] } } });
        if (waiting > 0) return 'payout_waiting' as const;
        const done = await tx.sellerPayout.count({ where: { sellerId: seller.id, accountDetails: { path: ['runDate'], equals: week.runDate } } });
        if (done > 0) return 'already_paid' as const;
        const balance = await computeSellerBalance(tx, seller.id);
        const amount = Math.floor(balance.available * 100) / 100;
        if (amount <= 0 || amount < minimum) return 'below_minimum' as const;
        const created = await tx.sellerPayout.create({
          data: {
            sellerId: seller.id,
            amount,
            commissionDeducted: 0, // order_items.seller_payout is already net of commission
            netAmount: amount,
            payoutMethod: destination.payoutMethod,
            accountDetails: { ...destination, automatic: true, runDate: week.runDate } as unknown as Prisma.InputJsonValue,
            status: 'pending',
            periodStart: await nextPeriodStart(tx, seller.id, seller.createdAt),
            periodEnd: new Date(`${week.periodEnd}T00:00:00Z`),
          },
        });
        await logPayoutEvent(tx, { payoutId: created.id, event: 'created', actorType: 'system', note: `Daily payout for orders up to ${week.periodEnd}, to ${destination.payoutMethod.replace('_', ' ')}` });
        return created;
      });
      if (typeof outcome === 'string') {
        result.skipped[outcome]++;
        continue;
      }
      const amount = Number(outcome.netAmount);
      result.created.push({ sellerId: seller.id, payoutId: outcome.id, amount });
      void recordAudit({ userId: null, action: 'payout:DAILY_CREATED', entityType: 'seller_payout', entityId: outcome.id, data: { sellerId: seller.id, amount, runDate: week.runDate }, responseStatus: 201 });
      await notify({
        userId: seller.userId,
        category: 'payments',
        type: 'payout',
        text: notificationText('payout.daily', { amount: `Rs ${amount.toLocaleString('en-PK')}`, periodEnd: week.periodEnd, method: destination.payoutMethod }),
        actionUrl: '/sellers/earnings',
        channels: ['push', 'email'],
        dedupeKey: `payout:${outcome.id}:daily`,
      });
    } catch (err) {
      // One kitchen's trouble does not hold up the others; the next hourly run tries it again.
      logger.error({ err, sellerId: seller.id, runDate: week.runDate }, 'Could not make a daily payout');
    }
  }

  if (result.created.length > 0) {
    const total = roundMoney(result.created.reduce((s, c) => s + c.amount, 0));
    const admins = await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } });
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        category: 'payments',
        type: 'payout',
        text: notificationText('admin.dailyPayouts', { count: result.created.length, total: `Rs ${total.toLocaleString('en-PK')}` }),
        actionUrl: '/admin/payouts',
        dedupeKey: `daily-payouts:${week.runDate}:${admin.id}:${result.created.length}`,
      });
    }
  }
  await noticeRiderPayDue(week.runDate, result);
  logger.info({ runDate: week.runDate, created: result.created.length, skipped: result.skipped, ridersDue: result.ridersDue.length }, 'Daily payouts');
  return result;
}

/** Tell each rider Nuray owes money to (pay earned beyond the cash they hold) that it is due today, and the admins the total. Once a day each. */
async function noticeRiderPayDue(runDate: string, result: PayoutRunResult) {
  const riders = await prisma.rider.findMany({ where: { status: 'active', verificationStatus: 'approved' }, select: { id: true, userId: true } });
  for (const rider of riders) {
    const { balance } = await riderMoney(prisma, rider.id);
    if (balance <= 0) continue;
    result.ridersDue.push({ riderId: rider.id, amount: balance });
    await notify({
      userId: rider.userId,
      category: 'payments',
      type: 'payout',
      text: notificationText('payout.riderDue', { amount: `Rs ${balance.toLocaleString('en-PK')}` }),
      actionUrl: '/riders/earnings',
      dedupeKey: `rider-pay-due:${runDate}:${rider.id}`,
    });
  }
  if (result.ridersDue.length === 0) return;
  const total = roundMoney(result.ridersDue.reduce((s, r) => s + r.amount, 0));
  const admins = await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      category: 'payments',
      type: 'payout',
      text: notificationText('admin.riderPayDue', { count: result.ridersDue.length, total: `Rs ${total.toLocaleString('en-PK')}` }),
      actionUrl: '/admin/riders?filter=owed',
      dedupeKey: `rider-pay-due:${runDate}:${admin.id}`,
    });
  }
}

export interface StatementLine {
  orderNumber: string;
  deliveredOn: string;
  kind: BalanceLine['kind'];
  orderTotal: number;
  kitchenShare: number;
  effect: number;
}

export interface PayoutStatement {
  payout: {
    id: string;
    amount: number;
    status: string;
    payoutMethod: string;
    accountNumber: string | null;
    accountTitle: string | null;
    automatic: boolean;
    periodStart: string;
    periodEnd: string;
    requestedAt: Date;
    processedAt: Date | null;
    transactionId: string | null;
  };
  kitchen: { id: string; businessName: string };
  lines: StatementLine[];
  totals: {
    online: number;
    riderCash: number;
    kitchenCollected: number;
    period: number;
    /** The balance from before the period, cash a rider handed in late, refunds, payments to Nuray: what the period's orders do not explain. */
    earlierAndAdjustments: number;
    /** Cash orders whose cash a rider still holds: in a later payout once handed in. */
    waitingForRiderCash: number;
  };
}

/** A payout's statement. With `sellerId`, only that kitchen's own payout (else 404). */
export async function getPayoutStatement(payoutId: string, opts: { sellerId?: string } = {}): Promise<PayoutStatement> {
  const payout = await prisma.sellerPayout.findUnique({
    where: { id: payoutId },
    include: { seller: { select: { id: true, businessName: true } } },
  });
  if (!payout || (opts.sellerId && payout.sellerId !== opts.sellerId)) {
    throw new AppError('Payout not found', 404, 'PAYOUT_NOT_FOUND');
  }
  // The period runs from the kitchen's previous payout to this one, by the moment each was made, so every order lands
  // in exactly the statement of the payout that paid it (a date range drifts: a "withdraw now" made at noon, or a
  // daily run that pays today's early orders with yesterday's).
  const previous = await prisma.sellerPayout.findFirst({
    where: { sellerId: payout.sellerId, status: { not: 'failed' }, amount: { gt: 0 }, createdAt: { lt: payout.createdAt } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const from = previous ? pktDate(previous.createdAt) : payout.periodStart.toISOString().slice(0, 10);
  const to = pktDate(payout.createdAt);
  const { lines } = await sellerBalanceLines(prisma, payout.sellerId);
  const inPeriod = lines
    .map((l) => ({ ...l, at: l.deliveredAt ?? l.placedAt, day: pktDate(l.deliveredAt ?? l.placedAt) }))
    .filter((l) => (!previous || l.at > previous.createdAt) && l.at <= payout.createdAt && (l.effect !== 0 || l.kind === 'rider_cash_waiting'))
    .sort((a, b) => a.day.localeCompare(b.day) || a.orderNumber.localeCompare(b.orderNumber));

  const sum = (kind: BalanceLine['kind'], field: 'effect' | 'kitchenShare' = 'effect') => roundMoney(inPeriod.filter((l) => l.kind === kind).reduce((s, l) => s + l[field], 0));
  const online = sum('online');
  const riderCash = sum('rider_cash');
  const kitchenCollected = sum('kitchen_collected');
  const period = roundMoney(online + riderCash + kitchenCollected);
  const amount = Number(payout.netAmount);
  const details = (payout.accountDetails ?? {}) as Record<string, unknown>;

  return {
    payout: {
      id: payout.id,
      amount,
      status: payout.status,
      payoutMethod: payout.payoutMethod,
      accountNumber: typeof details.accountNumber === 'string' ? details.accountNumber : null,
      accountTitle: typeof details.accountTitle === 'string' ? details.accountTitle : null,
      automatic: details.automatic === true,
      periodStart: from,
      periodEnd: to,
      requestedAt: payout.createdAt,
      processedAt: payout.processedAt,
      transactionId: payout.transactionId,
    },
    kitchen: { id: payout.seller.id, businessName: payout.seller.businessName },
    lines: inPeriod.map((l) => ({ orderNumber: l.orderNumber, deliveredOn: l.day, kind: l.kind, orderTotal: l.orderTotal, kitchenShare: l.kitchenShare, effect: l.effect })),
    totals: {
      online,
      riderCash,
      kitchenCollected,
      period,
      earlierAndAdjustments: roundMoney(amount - period),
      waitingForRiderCash: sum('rider_cash_waiting', 'kitchenShare'),
    },
  };
}

const KIND_LABEL: Record<BalanceLine['kind'], string> = {
  online: 'Paid online (Nuray holds it)',
  rider_cash: 'Cash, collected by a Nuray rider',
  rider_cash_waiting: 'Cash, still with the rider',
  kitchen_collected: 'Collected by the kitchen (commission owed)',
};

/** The statement as a spreadsheet. */
export function statementCsv(s: PayoutStatement): string {
  const rows: Array<Array<string | number>> = [
    ['Kitchen', s.kitchen.businessName],
    ['Payout', s.payout.id],
    ['Period', `${s.payout.periodStart} to ${s.payout.periodEnd}`],
    ['Amount (Rs)', s.payout.amount],
    ['Status', s.payout.status],
    [],
    ['Order', 'Delivered on', 'Money held by', 'Order total (Rs)', 'Kitchen share (Rs)', 'In this payout (Rs)'],
    ...s.lines.map((l) => [l.orderNumber, l.deliveredOn, KIND_LABEL[l.kind], l.orderTotal, l.kitchenShare, l.effect]),
    [],
    ['Orders in the period', '', '', '', '', s.totals.period],
    ['Earlier balance and adjustments', '', '', '', '', s.totals.earlierAndAdjustments],
    ['Payout', '', '', '', '', s.payout.amount],
  ];
  return toCsv(rows);
}
