/**
 * Computes whether a seller is currently open/closed/busy/on vacation/etc,
 * from its configured operating schedule, and whether it can currently
 * accept a new order (folds in cutoff time, daily order cap, pre-order-only).
 *
 * All time-of-day comparisons are done in Pakistan local time (UTC+5, no DST)
 * since that's the timezone every seller's schedule is configured in,
 * regardless of what timezone the server process happens to run in.
 */

import prisma from '../config/database';

const PKT_OFFSET_MINUTES = 5 * 60;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type DayName = (typeof DAY_NAMES)[number];

export type AvailabilityStatus = 'open' | 'closed' | 'busy' | 'vacation' | 'holiday' | 'preorder_only';

export interface OperatingSession {
  name: string;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export interface DaySchedule {
  closed: boolean;
  sessions: OperatingSession[];
}

export interface OperatingHours {
  fixedDaily?: { open: string; close: string };
  weekly?: Partial<Record<DayName, DaySchedule>>;
}

export interface SellerAvailabilityInput {
  status: string; // Seller.status
  scheduleMode: string;
  operatingHours: unknown;
  availabilityOverride: string | null;
  availabilityOverrideUntil: Date | null;
  availabilityNote: string | null;
}

export interface AvailabilityResult {
  status: AvailabilityStatus;
  isOpen: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  nextOpenAt: Date | null;
  reason: string | null;
  isManualOverride: boolean;
}

/** Current time-of-day in Pakistan, expressed as minutes since midnight, plus the day name. */
function pktParts(now: Date): { dayIndex: number; minutesSinceMidnight: number; pktDate: Date } {
  const pktMs = now.getTime() + PKT_OFFSET_MINUTES * 60 * 1000;
  const pktDate = new Date(pktMs);
  const dayIndex = pktDate.getUTCDay();
  const minutesSinceMidnight = pktDate.getUTCHours() * 60 + pktDate.getUTCMinutes();
  return { dayIndex, minutesSinceMidnight, pktDate };
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Build a real Date for a given PKT minutes-since-midnight offset from `now`, `daysAhead` days later. */
function pktMinutesToDate(now: Date, daysAhead: number, minutesSinceMidnight: number): Date {
  const { pktDate } = pktParts(now);
  const targetPktMidnightUtc = Date.UTC(
    pktDate.getUTCFullYear(),
    pktDate.getUTCMonth(),
    pktDate.getUTCDate() + daysAhead,
    0,
    0,
    0
  );
  const targetPktMs = targetPktMidnightUtc + minutesSinceMidnight * 60 * 1000;
  return new Date(targetPktMs - PKT_OFFSET_MINUTES * 60 * 1000);
}

function findNextSessionStart(
  weekly: Partial<Record<DayName, DaySchedule>>,
  startDayIndex: number,
  startMinutes: number
): { daysAhead: number; minutes: number } | null {
  for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
    const dayIndex = (startDayIndex + daysAhead) % 7;
    const day = weekly[DAY_NAMES[dayIndex]];
    if (!day || day.closed || !day.sessions?.length) continue;
    for (const session of [...day.sessions].sort((a, b) => parseHHMM(a.open) - parseHHMM(b.open))) {
      const openMin = parseHHMM(session.open);
      if (daysAhead > 0 || openMin >= startMinutes) {
        return { daysAhead, minutes: openMin };
      }
    }
  }
  return null;
}

function computeFromSchedule(seller: SellerAvailabilityInput, now: Date): AvailabilityResult {
  const base: AvailabilityResult = {
    status: 'closed',
    isOpen: false,
    opensAt: null,
    closesAt: null,
    nextOpenAt: null,
    reason: null,
    isManualOverride: false,
  };

  if (seller.scheduleMode === '24_7') {
    return { ...base, status: 'open', isOpen: true };
  }

  const { dayIndex, minutesSinceMidnight } = pktParts(now);
  const hours = (seller.operatingHours as OperatingHours) || {};

  if (seller.scheduleMode === 'fixed_daily' && hours.fixedDaily) {
    const openMin = parseHHMM(hours.fixedDaily.open);
    const closeMin = parseHHMM(hours.fixedDaily.close);
    const overnight = closeMin <= openMin; // e.g. open 18:00, close 02:00 (next day)
    const isOpen = overnight
      ? minutesSinceMidnight >= openMin || minutesSinceMidnight < closeMin
      : minutesSinceMidnight >= openMin && minutesSinceMidnight < closeMin;

    if (isOpen) {
      // Closing time is "later today" unless we're past midnight in the overnight
      // stretch (minutesSinceMidnight < closeMin), in which case it already rolled to today.
      const closeDaysAhead = overnight && minutesSinceMidnight >= openMin ? 1 : 0;
      return { ...base, status: 'open', isOpen: true, closesAt: pktMinutesToDate(now, closeDaysAhead, closeMin) };
    }
    // Fixed daily hours repeat identically every day — next opening is simply the
    // next calendar occurrence of the configured open time-of-day.
    const openDaysAhead = minutesSinceMidnight < openMin ? 0 : 1;
    const opensAt = pktMinutesToDate(now, openDaysAhead, openMin);
    return { ...base, opensAt, nextOpenAt: opensAt };
  }

  if (seller.scheduleMode === 'per_day' && hours.weekly) {
    const today = hours.weekly[DAY_NAMES[dayIndex]];
    if (today && !today.closed && today.sessions?.length) {
      const activeSession = today.sessions.find((s) => {
        const o = parseHHMM(s.open);
        const c = parseHHMM(s.close);
        return minutesSinceMidnight >= o && minutesSinceMidnight < c;
      });
      if (activeSession) {
        return { ...base, status: 'open', isOpen: true, closesAt: pktMinutesToDate(now, 0, parseHHMM(activeSession.close)) };
      }
    }
    const next = findNextSessionStart(hours.weekly, dayIndex, minutesSinceMidnight);
    if (next) {
      const nextDate = pktMinutesToDate(now, next.daysAhead, next.minutes);
      return { ...base, opensAt: nextDate, nextOpenAt: nextDate };
    }
    return { ...base, reason: 'No upcoming operating sessions configured' };
  }

  // scheduleMode set but no matching operatingHours payload — treat as closed, no schedule to compute from.
  return { ...base, reason: 'No operating schedule configured' };
}

export function computeSellerAvailability(seller: SellerAvailabilityInput, now: Date = new Date()): AvailabilityResult {
  if (seller.status !== 'active') {
    return {
      status: 'closed',
      isOpen: false,
      opensAt: null,
      closesAt: null,
      nextOpenAt: null,
      reason: 'Seller account is not active',
      isManualOverride: false,
    };
  }

  const overrideActive =
    seller.availabilityOverride != null &&
    (seller.availabilityOverrideUntil == null || seller.availabilityOverrideUntil.getTime() > now.getTime());

  if (overrideActive) {
    const status = seller.availabilityOverride as AvailabilityStatus;
    return {
      status,
      isOpen: status === 'open',
      opensAt: null,
      closesAt: seller.availabilityOverrideUntil,
      nextOpenAt: status === 'open' ? null : seller.availabilityOverrideUntil,
      reason: seller.availabilityNote,
      isManualOverride: true,
    };
  }

  return computeFromSchedule(seller, now);
}

/** Is this deliverySlotDate a real calendar day after today (PKT)? */
function isGenuineFutureDate(deliverySlotDate: string | undefined, now: Date): boolean {
  if (!deliverySlotDate) return false;
  const { pktDate } = pktParts(now);
  const todayUtcDay = Date.UTC(pktDate.getUTCFullYear(), pktDate.getUTCMonth(), pktDate.getUTCDate());
  const requestedDay = Date.UTC(
    new Date(deliverySlotDate).getUTCFullYear(),
    new Date(deliverySlotDate).getUTCMonth(),
    new Date(deliverySlotDate).getUTCDate()
  );
  return requestedDay > todayUtcDay;
}

/**
 * Whether a NEW order can be placed right now, folding in availability plus
 * home-kitchen order-acceptance controls (cutoff time, daily cap, pre-order-only).
 */
export async function isAcceptingOrders(
  seller: SellerAvailabilityInput & {
    id: string;
    orderCutoffTime: string | null;
    maxDailyOrders: number | null;
    preOrderOnly: boolean;
  },
  now: Date = new Date(),
  deliverySlotDate?: string
): Promise<{ accepting: boolean; reason: string | null }> {
  const availability = computeSellerAvailability(seller, now);
  // A seller that's pre-order-only — via the standing preOrderOnly flag, or a
  // temporary 'preorder_only' override — never accepts an IMMEDIATE order,
  // whether it's currently open or not: being open just means it's working
  // through prep, not that it takes same-day orders. Only a genuinely
  // future-dated booking gets through. This must be checked regardless of
  // isOpen — checking it only inside the "closed" branch let an open,
  // preOrderOnly seller show isAcceptingOrders:true to customers while
  // checkout (validateOrderTiming) rejected the same immediate order.
  const isPreorderCapable = seller.preOrderOnly || availability.status === 'preorder_only';
  if (isPreorderCapable && !isGenuineFutureDate(deliverySlotDate, now)) {
    return {
      accepting: false,
      reason: availability.isOpen
        ? 'This kitchen only accepts pre-orders for a future delivery date'
        : availability.reason || `Seller is currently ${availability.status.replace('_', ' ')}`,
    };
  }

  if (!availability.isOpen && !isPreorderCapable) {
    return { accepting: false, reason: availability.reason || `Seller is currently ${availability.status.replace('_', ' ')}` };
  }

  if (seller.orderCutoffTime) {
    const { minutesSinceMidnight } = pktParts(now);
    if (minutesSinceMidnight >= parseHHMM(seller.orderCutoffTime)) {
      return { accepting: false, reason: `Today's orders are closed after ${seller.orderCutoffTime}` };
    }
  }

  if (seller.maxDailyOrders != null) {
    const { pktDate } = pktParts(now);
    const dayStartUtc = new Date(
      Date.UTC(pktDate.getUTCFullYear(), pktDate.getUTCMonth(), pktDate.getUTCDate(), 0, 0, 0) - PKT_OFFSET_MINUTES * 60 * 1000
    );
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
    const todaysOrderCount = await prisma.orderItem.count({
      where: {
        sellerId: seller.id,
        createdAt: { gte: dayStartUtc, lt: dayEndUtc },
        status: { not: 'cancelled' },
      },
    });
    if (todaysOrderCount >= seller.maxDailyOrders) {
      return { accepting: false, reason: `This kitchen has reached its ${seller.maxDailyOrders}-order daily limit` };
    }
  }

  return { accepting: true, reason: null };
}

/** Validate a requested delivery slot date against pre-order/advance-booking rules. */
export function validateOrderTiming(
  seller: { preOrderOnly: boolean; advanceBookingMinDays: number | null; advanceBookingMaxDays: number | null },
  deliverySlotDate: string | undefined,
  now: Date = new Date()
): { valid: boolean; reason: string | null } {
  if (!seller.preOrderOnly && seller.advanceBookingMinDays == null && seller.advanceBookingMaxDays == null) {
    return { valid: true, reason: null };
  }
  if (!deliverySlotDate) {
    return seller.preOrderOnly
      ? { valid: false, reason: 'This kitchen requires a future delivery date to be selected' }
      : { valid: true, reason: null };
  }
  const { pktDate } = pktParts(now);
  const todayUtcDay = Date.UTC(pktDate.getUTCFullYear(), pktDate.getUTCMonth(), pktDate.getUTCDate());
  const requestedDay = Date.UTC(
    new Date(deliverySlotDate).getUTCFullYear(),
    new Date(deliverySlotDate).getUTCMonth(),
    new Date(deliverySlotDate).getUTCDate()
  );
  const daysAhead = Math.round((requestedDay - todayUtcDay) / (24 * 60 * 60 * 1000));

  const minDays = seller.advanceBookingMinDays ?? (seller.preOrderOnly ? 1 : 0);
  const maxDays = seller.advanceBookingMaxDays ?? (seller.preOrderOnly ? 7 : Infinity);

  if (daysAhead < minDays) {
    return { valid: false, reason: `Orders must be placed at least ${minDays} day(s) in advance` };
  }
  if (daysAhead > maxDays) {
    return { valid: false, reason: `Orders can only be placed up to ${maxDays} day(s) in advance` };
  }
  return { valid: true, reason: null };
}
