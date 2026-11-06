/**
 * The delivery windows a customer can choose at checkout, worked out in Pakistan time (UTC+5, no daylight saving)
 * whatever the phone's own clock zone. The server checks the same windows (order-placement.service.ts).
 */
export type SlotTime = 'morning' | 'afternoon' | 'evening';

export const SLOT_TIMES: SlotTime[] = ['morning', 'afternoon', 'evening'];

/** When each window closes, in minutes after midnight PKT. */
export const SLOT_END_MINUTES: Record<SlotTime, number> = {
  morning: 12 * 60,
  afternoon: 17 * 60,
  evening: 21 * 60 + 30,
};

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pkt(now: Date): Date {
  return new Date(now.getTime() + PKT_OFFSET_MS);
}

/** The calendar day in Pakistan, `daysAhead` days from now, as YYYY-MM-DD. */
export function pktDateString(now: Date, daysAhead = 0): string {
  return new Date(pkt(now).getTime() + daysAhead * DAY_MS).toISOString().slice(0, 10);
}

export function pktMinutesNow(now: Date): number {
  const p = pkt(now);
  return p.getUTCHours() * 60 + p.getUTCMinutes();
}

/** The windows still open today. */
export function openSlotsToday(now: Date): SlotTime[] {
  const minutes = pktMinutesNow(now);
  return SLOT_TIMES.filter((s) => SLOT_END_MINUTES[s] > minutes);
}

export interface SlotDay {
  /** Days after today (PKT): 0 is today. */
  offset: number;
  /** YYYY-MM-DD in PKT. */
  date: string;
  slots: SlotTime[];
}

/**
 * The days that can be chosen, from `minDays` to `maxDays` ahead. Today is left out once all its windows have passed.
 */
export function slotDays(now: Date, minDays: number, maxDays: number): SlotDay[] {
  const days: SlotDay[] = [];
  for (let offset = Math.max(0, minDays); offset <= Math.max(minDays, maxDays); offset++) {
    const slots = offset === 0 ? openSlotsToday(now) : SLOT_TIMES;
    if (slots.length) days.push({ offset, date: pktDateString(now, offset), slots });
  }
  return days;
}
