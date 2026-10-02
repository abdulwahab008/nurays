import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

/**
 * A rider's money with the platform (see RiderLedgerEntry in schema.prisma). Entries are
 * signed so the sum is what the platform owes the rider: fees and bonuses are +, cash taken
 * at the door is −, cash handed in is +, payouts are −.
 *
 *   balance  > 0: the platform owes the rider; < 0: the rider owes the platform
 *   cashHeld = cash collected − cash handed in (what the rider is carrying)
 *   unpaid   = balance + cashHeld (earnings not yet paid to the rider)
 *
 * Settling up usually nets the two: a rider holding Rs 5,000 who is owed Rs 1,200 of pay
 * hands in Rs 3,800 and keeps Rs 1,200 as their pay. That is recorded as Rs 5,000 of cash
 * handed in and a Rs 1,200 payout, so both the cash they hold and the balance end at 0.
 */

type Client = Prisma.TransactionClient | typeof prisma;

const money = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded; // never -0
};

export const DEFAULT_CASH_LIMIT = Number(process.env.RIDER_CASH_LIMIT) || 10_000;

export function cashLimitOf(rider: { cashLimit: unknown }): number {
  return rider.cashLimit != null ? Number(rider.cashLimit) : DEFAULT_CASH_LIMIT;
}

export interface RiderMoney {
  balance: number;
  cashHeld: number;
  unpaid: number;
  earned: number;
  paidOut: number;
}

export async function riderMoney(client: Client, riderId: string): Promise<RiderMoney> {
  const rows = await (client as typeof prisma).riderLedgerEntry.groupBy({
    by: ['type'],
    where: { riderId },
    _sum: { amount: true },
  });
  const sum = (type: string) => Number(rows.find((r) => r.type === type)?._sum.amount ?? 0);
  const balance = money(rows.reduce((total, r) => total + Number(r._sum.amount ?? 0), 0));
  const cashHeld = money(-(sum('cod_collected') + sum('cash_deposit')));
  return {
    balance,
    cashHeld,
    unpaid: money(balance + cashHeld),
    earned: money(sum('delivery_fee') + sum('bonus')),
    paidOut: money(-sum('payout')),
  };
}

/**
 * A completed delivery's entries: the rider's fee and bonus, and the cash they took if it was
 * a cash order. Inside the caller's transaction; each is written at most once per delivery.
 */
export async function postDeliveryEntries(
  tx: Prisma.TransactionClient,
  opts: { riderId: string; deliveryId: string; orderId: string; orderNumber: string; fee: number; bonus: number; cashCollected: number }
) {
  const data: Prisma.RiderLedgerEntryCreateManyInput[] = [];
  const base = { riderId: opts.riderId, deliveryId: opts.deliveryId, orderId: opts.orderId };
  if (opts.fee > 0) data.push({ ...base, type: 'delivery_fee', amount: money(opts.fee), note: `Delivery fee, order #${opts.orderNumber}` });
  if (opts.bonus > 0) data.push({ ...base, type: 'bonus', amount: money(opts.bonus), note: `Route bonus, order #${opts.orderNumber}` });
  if (opts.cashCollected > 0) {
    data.push({ ...base, type: 'cod_collected', amount: -money(opts.cashCollected), note: `Cash collected, order #${opts.orderNumber}` });
  }
  if (data.length) await tx.riderLedgerEntry.createMany({ data, skipDuplicates: true });
}

async function lockRider(tx: Prisma.TransactionClient, riderId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
}

function positiveAmount(amount: unknown): number {
  const value = money(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw new AppError('Enter an amount above zero', 400, 'INVALID_AMOUNT');
  return value;
}

function nonNegativeAmount(amount: unknown): number {
  if (amount == null || amount === '') return 0;
  const value = money(Number(amount));
  if (!Number.isFinite(value) || value < 0) throw new AppError('Amounts cannot be negative', 400, 'INVALID_AMOUNT');
  return value;
}

/**
 * An admin settles up with a rider at a hub: the cash they hand in, and how much of the cash
 * they hold they keep as their pay. Keeping pay is a payout made from the rider's cash, so it
 * can't be more than they hold or than they're owed.
 */
export async function recordSettlement(
  riderId: string,
  adminId: string,
  input: { cashHandedIn?: number; keptAsPay?: number; reference?: string; note?: string }
) {
  const handedIn = nonNegativeAmount(input.cashHandedIn);
  const kept = nonNegativeAmount(input.keptAsPay);
  if (handedIn + kept <= 0) throw new AppError('Enter the cash handed in, or the pay kept from it', 400, 'INVALID_AMOUNT');
  const reference = input.reference?.trim() || null;
  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await lockRider(tx, riderId);
    const { cashHeld, unpaid } = await riderMoney(tx, riderId);
    if (handedIn + kept > cashHeld + 0.009) {
      throw new AppError(`The rider holds Rs ${cashHeld.toLocaleString()} in cash; you can't settle more than that.`, 400, 'DEPOSIT_EXCEEDS_CASH');
    }
    if (kept > Math.max(0, unpaid) + 0.009) {
      throw new AppError(
        unpaid > 0 ? `The rider is owed Rs ${unpaid.toLocaleString()} of pay; they can keep no more than that.` : 'The rider is owed no pay right now.',
        400,
        'PAYOUT_EXCEEDS_BALANCE'
      );
    }
    const data: Prisma.RiderLedgerEntryCreateManyInput[] = [];
    const base = { riderId, reference, createdBy: adminId };
    if (handedIn > 0) data.push({ ...base, type: 'cash_deposit', amount: handedIn, note: note ?? 'Cash handed in' });
    if (kept > 0) {
      data.push({ ...base, type: 'cash_deposit', amount: kept, note: 'Kept from cash in hand as pay' });
      data.push({ ...base, type: 'payout', amount: -kept, note: note ?? 'Pay kept from cash in hand' });
    }
    await tx.riderLedgerEntry.createMany({ data });
    return { cashHandedIn: handedIn, keptAsPay: kept, ...(await riderMoney(tx, riderId)) };
  });
}

/** An admin records money paid to the rider. Never more than the platform owes them. */
export async function recordPayout(riderId: string, adminId: string, input: { amount: number; reference?: string; note?: string }) {
  const amount = positiveAmount(input.amount);
  return prisma.$transaction(async (tx) => {
    await lockRider(tx, riderId);
    const { balance } = await riderMoney(tx, riderId);
    if (amount > balance + 0.009) {
      throw new AppError(
        balance > 0 ? `The platform owes this rider Rs ${balance.toLocaleString()}; pay out no more than that.` : 'The platform owes this rider nothing right now.',
        400,
        'PAYOUT_EXCEEDS_BALANCE'
      );
    }
    return tx.riderLedgerEntry.create({
      data: { riderId, type: 'payout', amount: -amount, reference: input.reference?.trim() || null, note: input.note?.trim() || 'Paid to the rider', createdBy: adminId },
    });
  });
}

/** A correction (e.g. paying for a failed delivery that wasn't the rider's fault). */
export async function recordAdjustment(riderId: string, adminId: string, input: { amount: number; note: string }) {
  const amount = money(Number(input.amount));
  if (!Number.isFinite(amount) || amount === 0) throw new AppError('Enter a non-zero amount', 400, 'INVALID_AMOUNT');
  if (!input.note?.trim()) throw new AppError('Say what the adjustment is for', 400, 'NOTE_REQUIRED');
  return prisma.$transaction(async (tx) => {
    await lockRider(tx, riderId);
    return tx.riderLedgerEntry.create({ data: { riderId, type: 'adjustment', amount, note: input.note.trim(), createdBy: adminId } });
  });
}

/** An admin changes how much cash a rider may carry. null goes back to the default. */
export async function setCashLimit(riderId: string, cashLimit: number | null) {
  let value: number | null = null;
  if (cashLimit != null) {
    value = money(Number(cashLimit));
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      throw new AppError('Enter a cash limit between Rs 0 and Rs 1,000,000', 400, 'INVALID_AMOUNT');
    }
  }
  const updated = await prisma.rider.updateMany({ where: { id: riderId }, data: { cashLimit: value } });
  if (updated.count === 0) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
  return { cashLimit: value ?? DEFAULT_CASH_LIMIT, isDefault: value == null };
}

/**
 * Approved riders with what each holds and is owed, for settling up: whoever carries the
 * most cash first. `filter`: holding_cash (cash to collect), owed (the platform owes them).
 */
export async function listRidersWithMoney(opts: { search?: string; filter?: string; page?: number; limit?: number }) {
  const page = Math.max(1, Math.trunc(Number(opts.page)) || 1);
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(opts.limit)) || 25));
  const search = (opts.search ?? '').trim().slice(0, 100);
  const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const searchSql = search
    ? Prisma.sql`AND (p.full_name ILIKE ${pattern} OR u.phone ILIKE ${pattern} OR u.email ILIKE ${pattern} OR r.vehicle_number ILIKE ${pattern})`
    : Prisma.empty;
  const havingSql =
    opts.filter === 'holding_cash'
      ? Prisma.sql`HAVING -COALESCE(SUM(e.amount) FILTER (WHERE e.type IN ('cod_collected', 'cash_deposit')), 0) > 0`
      : opts.filter === 'owed'
        ? Prisma.sql`HAVING COALESCE(SUM(e.amount), 0) > 0`
        : Prisma.empty;

  const base = Prisma.sql`
    FROM riders r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN rider_ledger_entries e ON e.rider_id = r.id
    WHERE r.verification_status = 'approved' ${searchSql}
    GROUP BY r.id, u.id, p.full_name
    ${havingSql}`;

  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        id: string; city: string; vehicle_type: string | null; vehicle_number: string | null; status: string; is_available: boolean;
        cash_limit: Prisma.Decimal | null; total_deliveries: number; rating_average: Prisma.Decimal; phone: string; email: string | null;
        full_name: string | null; balance: number; cash_held: number; last_entry_at: Date | null;
      }>
    >`SELECT r.id, r.city, r.vehicle_type, r.vehicle_number, r.status, r.is_available, r.cash_limit, r.total_deliveries, r.rating_average,
             u.phone, u.email, p.full_name,
             COALESCE(SUM(e.amount), 0)::float AS balance,
             (-COALESCE(SUM(e.amount) FILTER (WHERE e.type IN ('cod_collected', 'cash_deposit')), 0))::float AS cash_held,
             MAX(e.created_at) AS last_entry_at
      ${base}
      ORDER BY cash_held DESC, balance DESC, p.full_name ASC NULLS LAST
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM (SELECT r.id ${base}) matched`,
  ]);

  const totals = await prisma.$queryRaw<Array<{ cash_held: number; owed: number }>>`
    SELECT COALESCE(SUM(GREATEST(cash, 0)), 0)::float AS cash_held, COALESCE(SUM(GREATEST(balance, 0)), 0)::float AS owed
    FROM (
      SELECT -COALESCE(SUM(amount) FILTER (WHERE type IN ('cod_collected', 'cash_deposit')), 0) AS cash, SUM(amount) AS balance
      FROM rider_ledger_entries GROUP BY rider_id
    ) per_rider`;

  return {
    riders: rows.map((r) => ({
      id: r.id,
      name: r.full_name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      vehicleType: r.vehicle_type,
      vehicleNumber: r.vehicle_number,
      status: r.status,
      isAvailable: r.is_available,
      totalDeliveries: r.total_deliveries,
      ratingAverage: Number(r.rating_average),
      balance: money(r.balance),
      cashHeld: money(r.cash_held),
      cashLimit: cashLimitOf({ cashLimit: r.cash_limit }),
      lastEntryAt: r.last_entry_at,
    })),
    totals: { cashHeld: money(totals[0]?.cash_held ?? 0), owedToRiders: money(totals[0]?.owed ?? 0) },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** One rider's money and details for the admin's settle-up page. */
export async function riderMoneyForAdmin(riderId: string, page = 1) {
  const rider = await prisma.rider.findUnique({ where: { id: riderId } });
  if (!rider) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
  const user = await prisma.user.findUnique({
    where: { id: rider.userId },
    select: { phone: true, email: true, profile: { select: { fullName: true } } },
  });
  const [summary, history] = await Promise.all([riderEarningsSummary(rider), listRiderEntries(rider.id, page)]);
  return {
    rider: {
      id: rider.id,
      name: user?.profile?.fullName ?? null,
      phone: user?.phone ?? null,
      email: user?.email ?? null,
      city: rider.city,
      vehicleType: rider.vehicleType,
      vehicleNumber: rider.vehicleNumber,
      status: rider.status,
      verificationStatus: rider.verificationStatus,
      isAvailable: rider.isAvailable,
      totalDeliveries: rider.totalDeliveries,
      ratingAverage: Number(rider.ratingAverage),
      cashLimitIsDefault: rider.cashLimit == null,
    },
    ...summary,
    ...history,
  };
}

export async function listRiderEntries(riderId: string, page = 1, limit = 30) {
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit) || 30));
  const [rows, total] = await Promise.all([
    prisma.riderLedgerEntry.findMany({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.riderLedgerEntry.count({ where: { riderId } }),
  ]);
  return {
    entries: rows.map((e) => ({
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      orderId: e.orderId,
      reference: e.reference,
      note: e.note,
      createdAt: e.createdAt,
    })),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  };
}

/** Pakistan time (UTC+5, no daylight saving): the start of today and of this week (Monday). */
function pktPeriodStarts(now = new Date()) {
  const offsetMs = 5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const dayStartLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const weekday = (local.getUTCDay() + 6) % 7; // Monday = 0
  return { today: new Date(dayStartLocal - offsetMs), week: new Date(dayStartLocal - weekday * 86_400_000 - offsetMs) };
}

/** What the rider app shows: money owed either way, cash carried against the limit, recent earnings. */
export async function riderEarningsSummary(rider: { id: string; cashLimit: unknown }) {
  const { today, week } = pktPeriodStarts();
  const earnedSince = async (since: Date) => {
    const agg = await prisma.riderLedgerEntry.aggregate({
      where: { riderId: rider.id, type: { in: ['delivery_fee', 'bonus'] }, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    return money(Number(agg._sum.amount ?? 0));
  };
  const deliveriesSince = (since: Date) =>
    prisma.delivery.count({ where: { riderId: rider.id, status: 'delivered', deliveryTime: { gte: since } } });
  const [totals, earnedToday, earnedThisWeek, deliveriesToday, deliveriesThisWeek] = await Promise.all([
    riderMoney(prisma, rider.id),
    earnedSince(today),
    earnedSince(week),
    deliveriesSince(today),
    deliveriesSince(week),
  ]);
  return { ...totals, cashLimit: cashLimitOf(rider), earnedToday, earnedThisWeek, deliveriesToday, deliveriesThisWeek };
}
