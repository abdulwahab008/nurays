/**
 * The weekly payout calendar, in Pakistan time (UTC+5 all year, no daylight saving). A week runs Monday to Sunday;
 * its payouts are made on the Monday after it, from 06:00 to midnight (the job runs hourly, so a missed hour catches
 * up the same day; a Monday missed altogether is covered the next week, as the balance carries over). Payouts are
 * not made on other days, so a server started mid-week does not pay everyone at once. No imports, so a unit test
 * can read it.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Payouts are made from this hour on Monday, Pakistan time. */
export const PAYOUT_HOUR_PKT = 6;

/** A calendar date (YYYY-MM-DD) in Pakistan time. */
export function pktDate(at: Date): string {
  return new Date(at.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface PayoutWeek {
  /** The Monday the payouts are made (YYYY-MM-DD, Pakistan time): the run's key, one payout per kitchen per run. */
  runDate: string;
  /** The last day the week's statement covers: the Sunday before. */
  periodEnd: string;
  /** True on that Monday from 06:00. */
  due: boolean;
}

/** The latest payout Monday at or before `now`, and whether its run time has come. */
export function payoutWeek(now: Date): PayoutWeek {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const runDate = addDays(local.toISOString().slice(0, 10), -sinceMonday);
  const due = sinceMonday === 0 && local.getUTCHours() >= PAYOUT_HOUR_PKT;
  return { runDate, periodEnd: addDays(runDate, -1), due };
}

/** The payout methods in the order a kitchen's saved accounts are tried. */
export const PAYOUT_METHOD_ORDER = ['bank_transfer', 'jazzcash', 'easypaisa'] as const;
