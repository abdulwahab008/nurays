/**
 * The payout calendar, in Pakistan time (UTC+5 all year, no daylight saving). Payouts are made every working day
 * (Monday to Friday, except the holidays an admin lists) from 06:00 to midnight, for everything up to the end of the
 * day before: Monday's run covers Friday's last hours, Saturday and Sunday. The job runs hourly, so a missed hour
 * catches up the same day, and a missed day is covered by the next one, as the balance carries over. No imports, so
 * a unit test can read it.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Payouts are made from this hour, Pakistan time. */
export const PAYOUT_HOUR_PKT = 6;

/** A calendar date (YYYY-MM-DD) in Pakistan time. */
export function pktDate(at: Date): string {
  return new Date(at.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface PayoutRun {
  /** The day the payouts are made (YYYY-MM-DD, Pakistan time): the run's key, one payout per kitchen per run. */
  runDate: string;
  /** The last day the run's statements cover: the day before. */
  periodEnd: string;
  /** True on a working day from 06:00. */
  due: boolean;
}

/** Today's payout run in Pakistan time, and whether it is due: a working day (not a listed holiday) from 06:00. */
export function payoutDay(now: Date, holidays: readonly string[] = []): PayoutRun {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const runDate = local.toISOString().slice(0, 10);
  const weekday = local.getUTCDay(); // Sunday 0 … Saturday 6
  const workingDay = weekday >= 1 && weekday <= 5 && !holidays.includes(runDate);
  return { runDate, periodEnd: addDays(runDate, -1), due: workingDay && local.getUTCHours() >= PAYOUT_HOUR_PKT };
}

/** The payout methods in the order a kitchen's saved accounts are tried. */
export const PAYOUT_METHOD_ORDER = ['bank_transfer', 'jazzcash', 'easypaisa'] as const;
