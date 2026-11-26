import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { notificationText } from '../utils/notificationText';
import { maxStandardRiderFee } from '../utils/deliveryFee';
import { getPlatformDeliveryPricing } from './delivery-pricing.service';
import { pktDate } from '../utils/payoutWeek';
import { CASH_DUE_HOURS, notifyAdmins, ridersWithOverdueCash } from './rider-deposit.service';

/** The nightly run, Pakistan time: after the day's orders, before the 06:00 payouts. */
const CHECK_HOUR_PKT = 3;
const PAYOUT_WAIT_DAYS = 2;
const DEPOSIT_WAIT_HOURS = 24;
const UNPOSTED_AFTER_MS = 60 * 60 * 1000;
const SHOWN = 10;
const HOUR_MS = 60 * 60 * 1000;

export interface BooksIssue {
  key: string;
  title: string;
  count: number;
  /** The first few, as a person reads them. */
  items: string[];
}

const rs = (n: unknown) => `Rs ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const issue = (key: string, title: string, items: string[]): BooksIssue[] =>
  items.length ? [{ key, title, count: items.length, items: items.slice(0, SHOWN) }] : [];

/** Everything in Nuray's books that does not add up, or money left waiting too long. Read-only. */
export async function findBooksIssues(now: Date = new Date()): Promise<BooksIssue[]> {
  // Columns hold UTC without a zone; the cut-offs are turned into UTC in SQL so a database set to local time compares right.
  const unpostedBefore = new Date(now.getTime() - UNPOSTED_AFTER_MS);
  const payoutBefore = new Date(now.getTime() - PAYOUT_WAIT_DAYS * 24 * HOUR_MS);
  const depositBefore = new Date(now.getTime() - DEPOSIT_WAIT_HOURS * HOUR_MS);

  // A rider's fee is capped by the farthest delivery distance (calculateDeliveryFeeCorridor); one above that was paid in error.
  const feeCap = maxStandardRiderFee((await getPlatformDeliveryPricing()).maxKm);
  const [unbalanced, unposted, cashDrift, duplicateRefs, unlogged, waitingPayouts, waitingDeposits, holding, overpaid] = await Promise.all([
    prisma.$queryRaw<Array<{ order_number: string; debit: unknown; credit: unknown }>>`
      SELECT o.order_number, x.debit, x.credit FROM (
        SELECT order_id,
          SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) AS debit,
          SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) AS credit
        FROM ledger_entries WHERE order_id IS NOT NULL GROUP BY order_id
      ) x JOIN orders o ON o.id = x.order_id
      WHERE abs(x.debit - x.credit) > 0.009 ORDER BY o.created_at`,
    prisma.$queryRaw<Array<{ order_number: string }>>`
      SELECT o.order_number FROM orders o
      WHERE o.payment_status = 'paid' AND o.order_status IN ('delivered', 'completed') AND o.updated_at < (${unpostedBefore}::timestamptz AT TIME ZONE 'UTC')
        AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.order_id = o.id)
      ORDER BY o.created_at`,
    prisma.$queryRaw<Array<{ name: string | null; cash_held: unknown; ledger: unknown }>>`
      SELECT p.full_name AS name, r.cash_held, COALESCE(-SUM(e.amount), 0) AS ledger FROM riders r
      LEFT JOIN rider_ledger_entries e ON e.rider_id = r.id AND e.type IN ('cod_collected', 'cash_deposit')
      LEFT JOIN user_profiles p ON p.user_id = r.user_id
      GROUP BY r.id, p.full_name, r.cash_held
      HAVING abs(r.cash_held - COALESCE(-SUM(e.amount), 0)) > 0.009`,
    prisma.$queryRaw<Array<{ transaction_id: string; n: bigint }>>`
      SELECT transaction_id, count(*) AS n FROM seller_payouts
      WHERE status = 'completed' AND net_amount > 0 AND btrim(coalesce(transaction_id, '')) <> ''
      GROUP BY transaction_id HAVING count(*) > 1`,
    prisma.$queryRaw<Array<{ business_name: string; net_amount: unknown }>>`
      SELECT s.business_name, p.net_amount FROM seller_payouts p JOIN sellers s ON s.id = p.seller_id
      WHERE p.status = 'completed'
        AND NOT EXISTS (SELECT 1 FROM payout_events e WHERE e.payout_id = p.id AND e.event IN ('sent', 'payment_received'))
      ORDER BY p.created_at`,
    prisma.$queryRaw<Array<{ business_name: string; net_amount: unknown; created_at: Date }>>`
      SELECT s.business_name, p.net_amount, p.created_at FROM seller_payouts p JOIN sellers s ON s.id = p.seller_id
      WHERE p.status = 'pending' AND p.created_at < (${payoutBefore}::timestamptz AT TIME ZONE 'UTC') ORDER BY p.created_at`,
    prisma.$queryRaw<Array<{ name: string | null; amount: unknown; transaction_ref: string }>>`
      SELECT p.full_name AS name, d.amount, d.transaction_ref FROM rider_cash_deposits d
      JOIN riders r ON r.id = d.rider_id LEFT JOIN user_profiles p ON p.user_id = r.user_id
      WHERE d.status = 'pending' AND d.created_at < (${depositBefore}::timestamptz AT TIME ZONE 'UTC') ORDER BY d.created_at`,
    prisma.$queryRaw<Array<{ id: string; name: string | null; cash_held: unknown }>>`
      SELECT r.id, p.full_name AS name, r.cash_held FROM riders r LEFT JOIN user_profiles p ON p.user_id = r.user_id
      WHERE r.cash_held > 0`,
    prisma.$queryRaw<Array<{ name: string | null; order_number: string | null; amount: unknown }>>`
      SELECT p.full_name AS name, o.order_number, e.amount FROM rider_ledger_entries e
      JOIN riders r ON r.id = e.rider_id LEFT JOIN user_profiles p ON p.user_id = r.user_id LEFT JOIN orders o ON o.id = e.order_id
      WHERE e.type = 'delivery_fee' AND e.amount > ${feeCap} ORDER BY e.created_at`,
  ]);
  const overdue = await ridersWithOverdueCash(holding.map((r) => r.id), now);

  return [
    ...issue('ledger_unbalanced', "Orders whose ledger doesn't balance (debits ≠ credits)", unbalanced.map((r) => `#${r.order_number}: debits ${rs(r.debit)}, credits ${rs(r.credit)}`)),
    ...issue('ledger_missing', 'Delivered, paid orders with nothing in the ledger', unposted.map((r) => `#${r.order_number}`)),
    ...issue('rider_cash_mismatch', "Riders whose cash in hand doesn't match their ledger", cashDrift.map((r) => `${r.name ?? 'Rider'}: shows ${rs(r.cash_held)}, ledger ${rs(r.ledger)}`)),
    ...issue('payout_reference_reused', 'One transfer reference on more than one sent payout', duplicateRefs.map((r) => `${r.transaction_id}: ${Number(r.n)} payouts`)),
    ...issue('payout_unlogged', 'Payouts marked sent with no log entry for it', unlogged.map((r) => `${r.business_name}: ${rs(r.net_amount)}`)),
    ...issue('payout_waiting', `Kitchen payouts not sent after ${PAYOUT_WAIT_DAYS} days`, waitingPayouts.map((r) => `${r.business_name}: ${rs(r.net_amount)} since ${pktDate(r.created_at)}`)),
    ...issue('deposit_waiting', `Rider deposits not checked after ${DEPOSIT_WAIT_HOURS} hours`, waitingDeposits.map((r) => `${r.name ?? 'Rider'}: ${rs(r.amount)}, ref ${r.transaction_ref}`)),
    ...issue('rider_fee_over_cap', `Rider fees above the most a delivery can pay (${rs(feeCap)})`, overpaid.map((r) => `${r.name ?? 'Rider'}: ${rs(r.amount)}${r.order_number ? ` on #${r.order_number}` : ''}`)),
    ...issue('cash_overdue', `Riders holding customer cash for more than ${CASH_DUE_HOURS} hours`, holding.filter((r) => overdue.has(r.id)).map((r) => `${r.name ?? 'Rider'}: ${rs(r.cash_held)}`)),
  ];
}

/** Runs the check, keeps the result, and (nightly) tells the admins when something needs looking at. */
export async function runBooksCheck(trigger: 'nightly' | 'manual', now: Date = new Date()) {
  const issues = await findBooksIssues(now);
  const row = await prisma.booksCheck.create({ data: { trigger, issues: issues as unknown as Prisma.InputJsonValue, ranAt: now } });
  if (trigger === 'nightly' && issues.length > 0) {
    await notifyAdmins(notificationText('admin.booksCheck', { count: issues.length }), `books-check:${pktDate(now)}`, '/admin/finance/accounts');
  }
  return { ranAt: row.ranAt, trigger, issues };
}

/** Once a day from 03:00 Pakistan time (the job runs hourly, so a missed hour catches up). */
export async function runNightlyBooksCheck(now: Date = new Date()) {
  if (new Date(now.getTime() + 5 * HOUR_MS).getUTCHours() < CHECK_HOUR_PKT) return null;
  const dayStart = new Date(`${pktDate(now)}T00:00:00+05:00`);
  if (await prisma.booksCheck.findFirst({ where: { trigger: 'nightly', ranAt: { gte: dayStart } }, select: { id: true } })) return null;
  return runBooksCheck('nightly', now);
}

export async function latestBooksCheck() {
  const row = await prisma.booksCheck.findFirst({ orderBy: { ranAt: 'desc' } });
  return row ? { ranAt: row.ranAt, trigger: row.trigger, issues: row.issues as unknown as BooksIssue[] } : null;
}
