import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { roundMoney } from '../utils/pricing';
import { isPrivateRef, isStoredFile, presentFile, storedFileOwner } from '../storage';
import { notificationText } from '../utils/notificationText';
import { notify } from './notify.service';
import adminService from './admin.service';
import { recordSettlement, riderMoney } from './rider-ledger.service';

/**
 * Riders deposit the cash they collect into Nuray's account themselves (bank, JazzCash or EasyPaisa) and submit the
 * transaction ID and a photo of the receipt. Their earned pay is netted: they keep it from the cash and deposit the
 * rest, so no transfer is needed for it. An admin checks the money arrived and approves (which posts the same rider
 * ledger entries an admin settle-up does, releasing the kitchens' share for the next payout) or rejects with a reason.
 *
 * Cash is not to stay with a rider: a rider holding cash collected more than CASH_DUE_HOURS ago (and not covered by a
 * deposit, approved or waiting) gets no new cash orders until they deposit it, and is reminded.
 */

export const CASH_DUE_HOURS = 24;
export const DEPOSIT_METHODS = ['bank_transfer', 'jazzcash', 'easypaisa'] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export interface NurayAccounts {
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
  jazzcashTitle: string;
  jazzcashNumber: string;
  easypaisaTitle: string;
  easypaisaNumber: string;
}

/** The accounts riders (and later kitchens) pay Nuray into; empty fields are not offered. */
export async function nurayAccounts(): Promise<NurayAccounts> {
  return (await adminService.getSettingValue<NurayAccounts>('nurayDepositAccounts')) as NurayAccounts;
}

type Db = typeof prisma | Prisma.TransactionClient;

async function pendingTotals(db: Db, riderId: string) {
  const sum = await db.riderCashDeposit.aggregate({ where: { riderId, status: 'pending' }, _sum: { amount: true, keptAsPay: true } });
  return { amount: Number(sum._sum.amount ?? 0), kept: Number(sum._sum.keptAsPay ?? 0) };
}

/**
 * When each rider's oldest cash still in hand was collected (cash is matched to deposits oldest first; a deposit
 * waiting for approval counts, so a slow review never blocks a rider who has paid). Riders with no cash left out.
 */
export async function cashHeldSince(riderIds: string[]): Promise<Map<string, Date>> {
  if (riderIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ rider_id: string; since: Date }>>`
    WITH cod AS (
      SELECT rider_id, created_at,
             SUM(-amount) OVER (PARTITION BY rider_id ORDER BY created_at, id) AS collected_so_far
      FROM rider_ledger_entries WHERE type = 'cod_collected' AND rider_id = ANY(${riderIds})
    ),
    paid AS (
      SELECT rider_id, SUM(amount) AS total FROM (
        SELECT rider_id, amount FROM rider_ledger_entries WHERE type = 'cash_deposit' AND rider_id = ANY(${riderIds})
        UNION ALL
        SELECT rider_id, amount + kept_as_pay FROM rider_cash_deposits WHERE status = 'pending' AND rider_id = ANY(${riderIds})
      ) d GROUP BY rider_id
    )
    SELECT cod.rider_id, MIN(cod.created_at) AS since
    FROM cod LEFT JOIN paid USING (rider_id)
    WHERE cod.collected_so_far > COALESCE(paid.total, 0) + 0.009
    GROUP BY cod.rider_id`;
  return new Map(rows.map((r) => [r.rider_id, r.since]));
}

/** Riders whose cash has been in hand longer than CASH_DUE_HOURS: they take no cash orders until they deposit it. */
export async function ridersWithOverdueCash(riderIds: string[], now: Date = new Date()): Promise<Set<string>> {
  const cutoff = now.getTime() - CASH_DUE_HOURS * 3600 * 1000;
  const since = await cashHeldSince(riderIds);
  return new Set([...since].filter(([, at]) => at.getTime() < cutoff).map(([id]) => id));
}

/** What the rider should deposit now: the cash they hold less what is already waiting, keeping the pay they are owed. */
export async function depositSummary(userId: string) {
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });
  if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
  const [money, pending, since, accounts, deposits] = await Promise.all([
    riderMoney(prisma, rider.id),
    pendingTotals(prisma, rider.id),
    cashHeldSince([rider.id]),
    nurayAccounts(),
    prisma.riderCashDeposit.findMany({ where: { riderId: rider.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const cashToSettle = roundMoney(Math.max(0, money.cashHeld - pending.amount - pending.kept));
  const keepAsPay = roundMoney(Math.min(cashToSettle, Math.max(0, money.unpaid - pending.kept)));
  const heldSince = since.get(rider.id) ?? null;
  return {
    cashHeld: money.cashHeld,
    waitingForApproval: roundMoney(pending.amount + pending.kept),
    keepAsPay,
    toDeposit: roundMoney(cashToSettle - keepAsPay),
    heldSince,
    dueBy: heldSince ? new Date(heldSince.getTime() + CASH_DUE_HOURS * 3600 * 1000) : null,
    overdue: heldSince !== null && heldSince.getTime() < Date.now() - CASH_DUE_HOURS * 3600 * 1000,
    accounts,
    deposits: deposits.map((d) => ({
      id: d.id,
      amount: Number(d.amount),
      keptAsPay: Number(d.keptAsPay),
      method: d.method,
      transactionRef: d.transactionRef,
      status: d.status,
      rejectionReason: d.rejectionReason,
      createdAt: d.createdAt,
      reviewedAt: d.reviewedAt,
    })),
  };
}

const notifyAdmins = async (text: ReturnType<typeof notificationText>, dedupeKey: string, actionUrl: string) => {
  const admins = await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } });
  for (const admin of admins) await notify({ userId: admin.id, category: 'payments', type: 'payout', text, actionUrl, dedupeKey: `${dedupeKey}:${admin.id}` });
};

/** A rider submits a deposit they made: the amount, the pay kept from the cash, the method, the transaction ID and the receipt. */
export async function submitDeposit(
  userId: string,
  input: { amount: number; keptAsPay?: number; method: DepositMethod; transactionRef: string; receiptUrl: string }
) {
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });
  if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
  const amount = roundMoney(input.amount);
  const kept = roundMoney(input.keptAsPay ?? 0);
  const ref = input.transactionRef.trim();
  if (!(amount > 0)) throw new AppError('Enter the amount you deposited', 400, 'INVALID_AMOUNT');
  if (ref.length < 4) throw new AppError('Enter the transaction ID from your receipt', 400, 'REFERENCE_REQUIRED');
  if (!isPrivateRef(input.receiptUrl) || !isStoredFile(input.receiptUrl, { private: 'proofs' }) || storedFileOwner(input.receiptUrl) !== userId) {
    throw new AppError('Please upload the receipt again', 400, 'INVALID_PROOF_URL');
  }
  const accounts = await nurayAccounts();
  const offered = { bank_transfer: accounts.bankAccountNumber, jazzcash: accounts.jazzcashNumber, easypaisa: accounts.easypaisaNumber }[input.method];
  if (!offered) throw new AppError('Nuray has no account for this method; choose another', 400, 'METHOD_UNAVAILABLE');

  const deposit = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM riders WHERE id = ${rider.id} FOR UPDATE`;
    const [money, pending] = await Promise.all([riderMoney(tx, rider.id), pendingTotals(tx, rider.id)]);
    if (amount + kept > money.cashHeld - pending.amount - pending.kept + 0.009) {
      const left = roundMoney(Math.max(0, money.cashHeld - pending.amount - pending.kept));
      throw new AppError(`You hold Rs ${left.toLocaleString('en-PK')} that is not deposited yet; you can't deposit more than that.`, 400, 'DEPOSIT_EXCEEDS_CASH');
    }
    if (kept > Math.max(0, money.unpaid - pending.kept) + 0.009) {
      throw new AppError(`You can keep at most Rs ${roundMoney(Math.max(0, money.unpaid - pending.kept)).toLocaleString('en-PK')} as pay.`, 400, 'PAYOUT_EXCEEDS_BALANCE');
    }
    // The same transaction ID twice is almost always a double tap or a re-used receipt.
    const reused = await tx.riderCashDeposit.count({ where: { transactionRef: ref, method: input.method, status: { not: 'rejected' } } });
    if (reused > 0) throw new AppError('This transaction ID has already been submitted', 409, 'DUPLICATE_REFERENCE');
    return tx.riderCashDeposit.create({ data: { riderId: rider.id, amount, keptAsPay: kept, method: input.method, transactionRef: ref, receiptUrl: input.receiptUrl } });
  });
  await notifyAdmins(notificationText('admin.depositSubmitted', { amount: `Rs ${amount.toLocaleString('en-PK')}` }), `deposit:${deposit.id}`, '/admin/finance/deposits');
  return { id: deposit.id, status: deposit.status };
}

/**
 * The rider keeps cash they hold as the pay Nuray owes them, with nothing to transfer: no receipt to check, so it is
 * posted at once (the same entries an admin settle-up writes for pay kept), recorded as made by the rider.
 */
export async function keepCashAsPay(userId: string, amount: number) {
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });
  if (!rider) throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
  const kept = roundMoney(amount);
  if (!(kept > 0)) throw new AppError('Enter the pay you keep', 400, 'INVALID_AMOUNT');
  const pending = await pendingTotals(prisma, rider.id);
  const money = await riderMoney(prisma, rider.id);
  if (kept > money.cashHeld - pending.amount - pending.kept + 0.009) throw new AppError('You cannot keep more cash than you hold', 400, 'DEPOSIT_EXCEEDS_CASH');
  if (kept > Math.max(0, money.unpaid - pending.kept) + 0.009) throw new AppError('You cannot keep more than the pay Nuray owes you', 400, 'PAYOUT_EXCEEDS_BALANCE');
  // recordSettlement re-checks both limits under the rider's row lock.
  const result = await recordSettlement(rider.id, userId, { keptAsPay: kept, note: 'Kept from cash in hand as pay (by the rider)' });
  void recordAudit({ userId, action: 'rider_deposit:KEPT_AS_PAY', entityType: 'rider', entityId: rider.id, data: { amount: kept }, responseStatus: 200 });
  return { keptAsPay: kept, cashHeld: result.cashHeld };
}

/** Deposits for admins to check, with a signed link to each receipt. */
export async function listDeposits(status: string | undefined, page = 1, limit = 30) {
  const where: Prisma.RiderCashDepositWhereInput = status && ['pending', 'approved', 'rejected'].includes(status) ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.riderCashDeposit.findMany({ where, orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' }, skip: (page - 1) * limit, take: limit, include: { rider: { select: { id: true, userId: true, cashHeld: true } } } }),
    prisma.riderCashDeposit.count({ where }),
  ]);
  const names = new Map(
    (await prisma.userProfile.findMany({ where: { userId: { in: rows.map((r) => r.rider.userId) } }, select: { userId: true, fullName: true } })).map((p) => [p.userId, p.fullName])
  );
  const deposits = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      rider: { id: d.rider.id, name: names.get(d.rider.userId) ?? 'Rider', cashHeld: Number(d.rider.cashHeld) },
      amount: Number(d.amount),
      keptAsPay: Number(d.keptAsPay),
      method: d.method,
      transactionRef: d.transactionRef,
      receipt: await presentFile(d.receiptUrl),
      status: d.status,
      rejectionReason: d.rejectionReason,
      createdAt: d.createdAt,
      reviewedAt: d.reviewedAt,
    }))
  );
  return { deposits, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * An admin confirms the money arrived: the deposit is approved and posted to the rider ledger (cash handed in, and the
 * pay kept from the cash), which also releases the kitchens' share of those cash orders for the next payout.
 */
export async function approveDeposit(depositId: string, adminId: string) {
  const claimed = await prisma.riderCashDeposit.updateMany({ where: { id: depositId, status: 'pending' }, data: { status: 'approved', reviewedBy: adminId, reviewedAt: new Date() } });
  if (claimed.count === 0) throw new AppError('This deposit is not waiting for approval', 409, 'DEPOSIT_NOT_PENDING');
  const d = (await prisma.riderCashDeposit.findUnique({ where: { id: depositId } }))!;
  try {
    const result = await recordSettlement(d.riderId, adminId, {
      cashHandedIn: Number(d.amount),
      keptAsPay: Number(d.keptAsPay),
      reference: d.transactionRef,
      note: `Deposited by ${d.method === 'bank_transfer' ? 'bank transfer' : d.method === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} (deposit ${d.id})`,
    });
    void recordAudit({ userId: adminId, action: 'rider_deposit:APPROVED', entityType: 'rider_cash_deposit', entityId: d.id, data: { riderId: d.riderId, amount: Number(d.amount), keptAsPay: Number(d.keptAsPay), transactionRef: d.transactionRef }, responseStatus: 200 });
    return { id: d.id, status: 'approved', cashHeld: result.cashHeld };
  } catch (err) {
    // Nothing was posted: put it back for another look.
    await prisma.riderCashDeposit.update({ where: { id: depositId }, data: { status: 'pending', reviewedBy: null, reviewedAt: null } });
    throw err;
  }
}

/** The money did not arrive (or the receipt is wrong): nothing is posted and the rider is told why. */
export async function rejectDeposit(depositId: string, adminId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new AppError('Say why the deposit is rejected', 400, 'REASON_REQUIRED');
  const claimed = await prisma.riderCashDeposit.updateMany({ where: { id: depositId, status: 'pending' }, data: { status: 'rejected', rejectionReason: why, reviewedBy: adminId, reviewedAt: new Date() } });
  if (claimed.count === 0) throw new AppError('This deposit is not waiting for approval', 409, 'DEPOSIT_NOT_PENDING');
  const d = (await prisma.riderCashDeposit.findUnique({ where: { id: depositId }, include: { rider: { select: { userId: true } } } }))!;
  void recordAudit({ userId: adminId, action: 'rider_deposit:REJECTED', entityType: 'rider_cash_deposit', entityId: d.id, data: { riderId: d.riderId, amount: Number(d.amount), reason: why }, responseStatus: 200 });
  await notify({
    userId: d.rider.userId,
    category: 'payments',
    type: 'payout',
    text: notificationText('rider.depositRejected', { amount: `Rs ${Number(d.amount).toLocaleString('en-PK')}`, reason: why }),
    actionUrl: '/riders/earnings',
    channels: ['push'],
    dedupeKey: `deposit:${d.id}:rejected`,
  });
  return { id: d.id, status: 'rejected' };
}

/** Hourly: remind each rider holding cash past the deadline (once a day) and tell the admins who they are. */
export async function remindOverdueCash(now: Date = new Date()) {
  const riders = await prisma.rider.findMany({ where: { status: 'active', verificationStatus: 'approved', cashHeld: { gt: 0 } }, select: { id: true, userId: true, cashHeld: true } });
  const overdue = await ridersWithOverdueCash(riders.map((r) => r.id), now);
  const day = new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const late = riders.filter((r) => overdue.has(r.id));
  for (const r of late) {
    await notify({
      userId: r.userId,
      category: 'payments',
      type: 'payout',
      text: notificationText('rider.cashOverdue', { hours: CASH_DUE_HOURS }),
      actionUrl: '/riders/earnings',
      channels: ['push'],
      dedupeKey: `cash-overdue:${day}:${r.id}`,
    });
  }
  if (late.length > 0) {
    const total = roundMoney(late.reduce((s, r) => s + Number(r.cashHeld), 0));
    await notifyAdmins(notificationText('admin.cashOverdue', { count: late.length, total: `Rs ${total.toLocaleString('en-PK')}`, hours: CASH_DUE_HOURS }), `cash-overdue:${day}`, '/admin/riders?filter=holding_cash');
  }
  return { overdue: late.length };
}
