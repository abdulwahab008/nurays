import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { roundMoney } from '../utils/pricing';
import { toCsv } from '../utils/csv';
import { computeSellerBalance, sellerBalanceLines, type LineKind } from './seller-balance.service';
import { riderMoney } from './rider-ledger.service';

/**
 * Accounts, as a marketplace's finance team reads them: one account per kitchen and per rider, each a statement of
 * debits and credits with a running balance, and Nuray's own account (revenue, costs, GST owed).
 *
 * The sign is always "what Nuray owes them": a credit raises it, a debit lowers it, and a negative balance means
 * they owe Nuray. The numbers come from the same places the app already pays from (the kitchen balance in
 * seller-balance.service, the rider ledger), so a statement always agrees with the payout screens.
 */

export interface StatementLine {
  date: string;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  party: { type: 'kitchen' | 'rider'; id: string; name: string };
  from: string | null;
  to: string | null;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: StatementLine[];
  /** Not in the balance yet: the kitchen's share of cash orders a rider has not handed in. */
  awaitingRiderCash?: number;
  /** A rider's cash in hand (part of their balance). */
  cashHeld?: number;
}

type Entry = { at: Date; description: string; reference: string | null; amount: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pktDay = (d: Date) => new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Entries in date order with a running balance; entries before `from` make the opening balance. */
function buildStatement(party: Statement['party'], entries: Entry[], from?: string, to?: string): Statement {
  for (const d of [from, to]) if (d && !DAY.test(d)) throw new AppError('Dates are YYYY-MM-DD', 400, 'VALIDATION_ERROR');
  const sorted = [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
  let balance = 0;
  let opening = 0;
  const lines: StatementLine[] = [];
  for (const e of sorted) {
    const day = pktDay(e.at);
    if (to && day > to) break;
    balance = roundMoney(balance + e.amount);
    if (from && day < from) {
      opening = balance;
      continue;
    }
    lines.push({ date: day, description: e.description, reference: e.reference, debit: e.amount < 0 ? roundMoney(-e.amount) : 0, credit: e.amount > 0 ? roundMoney(e.amount) : 0, balance });
  }
  return {
    party,
    from: from ?? null,
    to: to ?? null,
    openingBalance: opening,
    totalDebit: roundMoney(lines.reduce((s, l) => s + l.debit, 0)),
    totalCredit: roundMoney(lines.reduce((s, l) => s + l.credit, 0)),
    closingBalance: balance,
    lines,
  };
}

const KITCHEN_LINE: Record<Exclude<LineKind, 'rider_cash_waiting'>, string> = {
  online: 'Paid online: your share',
  rider_cash: 'Cash collected by a Nuray rider: your share',
  kitchen_collected: 'Cash you collected: commission, GST and fees owed to Nuray',
};

/** A kitchen's account: every earning order, what it owes on money it collected, payouts and payments to Nuray. */
export async function kitchenStatement(sellerId: string, from?: string, to?: string): Promise<Statement> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true, businessName: true } });
  if (!seller) throw new AppError('Kitchen not found', 404, 'SELLER_NOT_FOUND');
  const [{ lines }, payouts] = await Promise.all([
    sellerBalanceLines(prisma, sellerId),
    prisma.sellerPayout.findMany({ where: { sellerId, status: { in: ['completed', 'pending', 'processing'] } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const entries: Entry[] = [];
  let awaitingRiderCash = 0;
  for (const l of lines) {
    if (l.kind === 'rider_cash_waiting') {
      awaitingRiderCash += l.kitchenShare;
      continue;
    }
    if (l.effect === 0) continue;
    entries.push({ at: l.deliveredAt ?? l.placedAt, description: `${KITCHEN_LINE[l.kind]} (order total Rs ${l.orderTotal})`, reference: l.orderNumber, amount: l.effect });
  }
  for (const p of payouts) {
    const amount = Number(p.netAmount);
    entries.push(
      amount < 0
        ? { at: p.processedAt ?? p.createdAt, description: 'Payment received from the kitchen', reference: p.transactionId, amount: -amount }
        : { at: p.createdAt, description: p.status === 'completed' ? `Payout sent (${p.payoutMethod})` : `Payout on its way (${p.payoutMethod})`, reference: p.transactionId, amount: -amount }
    );
  }
  const statement = buildStatement({ type: 'kitchen', id: seller.id, name: seller.businessName }, entries, from, to);
  return { ...statement, awaitingRiderCash: roundMoney(awaitingRiderCash) };
}

const RIDER_LINE: Record<string, string> = {
  delivery_fee: 'Delivery fee earned',
  bonus: 'Route bonus earned',
  cod_collected: 'Cash collected from the customer (owed to Nuray)',
  cash_deposit: 'Cash handed in to Nuray',
  payout: 'Pay sent to the rider',
  adjustment: 'Correction by an admin',
};

/** A rider's account: the rider ledger as a statement (fees and bonuses in, cash collected and pay sent out). */
export async function riderStatement(riderId: string, from?: string, to?: string): Promise<Statement> {
  const rider = await prisma.rider.findUnique({ where: { id: riderId }, select: { id: true, userId: true } });
  if (!rider) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');
  const [rows, money, profile] = await Promise.all([
    prisma.riderLedgerEntry.findMany({ where: { riderId }, orderBy: { createdAt: 'asc' }, include: { delivery: { select: { order: { select: { orderNumber: true } } } } } }),
    riderMoney(prisma, riderId),
    prisma.userProfile.findUnique({ where: { userId: rider.userId }, select: { fullName: true } }),
  ]);
  const entries = rows.map((r) => ({
    at: r.createdAt,
    description: r.note && r.type === 'adjustment' ? `${RIDER_LINE.adjustment}: ${r.note}` : RIDER_LINE[r.type] ?? r.type,
    reference: r.delivery?.order?.orderNumber ?? r.reference ?? null,
    amount: Number(r.amount),
  }));
  const statement = buildStatement({ type: 'rider', id: rider.id, name: profile?.fullName ?? 'Rider' }, entries, from, to);
  return { ...statement, cashHeld: money.cashHeld };
}

export function statementCsv(s: Statement): string {
  return toCsv([
    [s.party.type === 'kitchen' ? 'Kitchen' : 'Rider', s.party.name],
    ['Period', `${s.from ?? 'start'} to ${s.to ?? 'today'}`],
    ['Opening balance (Rs, + Nuray owes them)', s.openingBalance],
    [],
    ['Date', 'Description', 'Reference', 'Debit (Rs)', 'Credit (Rs)', 'Balance (Rs)'],
    ...s.lines.map((l) => [l.date, l.description, l.reference ?? '', l.debit || '', l.credit || '', l.balance]),
    [],
    ['Totals', '', '', s.totalDebit, s.totalCredit, ''],
    ['Closing balance (Rs, + Nuray owes them)', '', '', '', '', s.closingBalance],
    ...(s.awaitingRiderCash ? [['Not yet in the balance: cash still with riders (Rs)', '', '', '', '', s.awaitingRiderCash]] : []),
  ]);
}

/**
 * Every kitchen's and rider's account in one list: what Nuray owes them (or they owe Nuray). The kitchen balances are
 * worked out from their orders one by one.
 * ponytail: one balance per kitchen per request (~0.4 s at 20,000 orders each); page or store running totals past a few hundred kitchens.
 */
export async function listAccounts() {
  const [sellers, riders] = await Promise.all([
    prisma.seller.findMany({ where: { verificationStatus: 'approved' }, select: { id: true, businessName: true, status: true }, orderBy: { businessName: 'asc' } }),
    prisma.rider.findMany({ where: { verificationStatus: 'approved' }, select: { id: true, status: true, userId: true } }),
  ]);
  const kitchens = await Promise.all(
    sellers.map(async (s) => {
      const b = await computeSellerBalance(prisma, s.id);
      return { id: s.id, name: s.businessName, status: s.status, balance: roundMoney(b.available + b.pendingPayout), payoutOnItsWay: b.pendingPayout, awaitingRiderCash: b.awaitingRiderCash, earned: b.totalEarnings, paidOut: b.paidOut };
    })
  );
  const names = new Map(
    (await prisma.userProfile.findMany({ where: { userId: { in: riders.map((r) => r.userId) } }, select: { userId: true, fullName: true } })).map((p) => [p.userId, p.fullName])
  );
  const riderRows = await Promise.all(
    riders.map(async (r) => {
      const m = await riderMoney(prisma, r.id);
      return { id: r.id, name: names.get(r.userId) ?? 'Rider', status: r.status, balance: m.balance, cashHeld: m.cashHeld, earned: m.earned, paidOut: m.paidOut };
    })
  );
  const sum = (rows: Array<{ balance: number }>, sign: 1 | -1) => roundMoney(rows.filter((r) => r.balance * sign > 0).reduce((s, r) => s + r.balance * sign, 0));
  // The ones with money to settle first, then by name.
  const weight = (r: { balance: number; awaitingRiderCash?: number; cashHeld?: number }) => Math.abs(r.balance) + (r.awaitingRiderCash ?? 0) + (r.cashHeld ?? 0);
  const byMoney = <T extends { name: string; balance: number }>(rows: T[]) => rows.sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
  return {
    kitchens: byMoney(kitchens),
    riders: byMoney(riderRows),
    totals: {
      owedToKitchens: sum(kitchens, 1),
      owedByKitchens: sum(kitchens, -1),
      owedToRiders: sum(riderRows, 1),
      owedByRiders: sum(riderRows, -1),
      cashWithRiders: roundMoney(riderRows.reduce((s, r) => s + r.cashHeld, 0)),
    },
  };
}

/** Nuray's own account by month (delivery month, Pakistan time): revenue, costs and the GST it owes. */
export async function nurayAccountByMonth() {
  const ledger = await prisma.$queryRaw<Array<{ month: string; type: string; amount: string }>>`
    SELECT to_char((COALESCE(o.delivered_at, o.paid_at, o.created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi', 'YYYY-MM') AS month,
           l.transaction_type AS type, sum(l.amount) AS amount
    FROM ledger_entries l JOIN orders o ON o.id = l.order_id
    GROUP BY 1, 2`;
  const riderPay = await prisma.$queryRaw<Array<{ month: string; amount: string }>>`
    SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi', 'YYYY-MM') AS month, sum(amount) AS amount
    FROM rider_ledger_entries WHERE type IN ('delivery_fee', 'bonus') GROUP BY 1`;
  const months = new Map<string, { month: string; sales: number; commission: number; deliveryFees: number; riderPay: number; platformDiscounts: number; gst: number }>();
  const row = (m: string) => {
    if (!months.has(m)) months.set(m, { month: m, sales: 0, commission: 0, deliveryFees: 0, riderPay: 0, platformDiscounts: 0, gst: 0 });
    return months.get(m)!;
  };
  for (const r of ledger) {
    const m = row(r.month);
    const amount = Number(r.amount);
    if (r.type === 'customer_payment') m.sales += amount;
    else if (r.type === 'platform_commission') m.commission += amount;
    else if (r.type === 'delivery_fee') m.deliveryFees += amount;
    else if (r.type === 'platform_discount') m.platformDiscounts += amount;
    else if (r.type === 'gst_payable') m.gst += amount;
  }
  for (const r of riderPay) row(r.month).riderPay += Number(r.amount);
  return [...months.values()]
    .map((m) => {
      const revenue = roundMoney(m.commission + m.deliveryFees);
      const costs = roundMoney(m.riderPay + m.platformDiscounts);
      return { ...m, sales: roundMoney(m.sales), commission: roundMoney(m.commission), deliveryFees: roundMoney(m.deliveryFees), riderPay: roundMoney(m.riderPay), platformDiscounts: roundMoney(m.platformDiscounts), gst: roundMoney(m.gst), revenue, costs, net: roundMoney(revenue - costs) };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}
