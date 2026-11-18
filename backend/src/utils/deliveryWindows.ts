/**
 * The delivery windows a customer can book with a kitchen, worked out from the kitchen's own opening hours (Pakistan time,
 * UTC+5, no daylight saving).
 *
 * - Open all day, or one opening session that day: the standard morning, afternoon and evening, cut to the hours the
 *   kitchen is open (open 10:00–15:00 gives morning 10–12 and afternoon 12–3). A session outside all three is one window.
 * - Several sessions that day ("Lunch 12–3", "Dinner 7–10"): each session is a window, under the kitchen's own name.
 * - Closed that day: none.
 * Today only offers a window the kitchen can still cook for (its minimum prep time before the window ends), and none once
 * its order cut-off has passed.
 *
 * A window is stored on the order as "HH:MM-HH:MM". Orders from before kept "morning", "afternoon" or "evening"
 * (LEGACY_WINDOWS), which still mean the hours they did.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
/** A window shorter than this is not worth offering (a session cut down to 10 minutes). */
const MIN_WINDOW_MINUTES = 30;
/** How many days ahead a kitchen that set no limit can be booked. */
export const DEFAULT_MAX_DAYS_AHEAD = 6;

export type StandardWindow = 'morning' | 'afternoon' | 'evening';

/** The standard windows, and the hours the old named windows stand for, in minutes after midnight. */
export const LEGACY_WINDOWS: Record<StandardWindow, { start: number; end: number }> = {
  morning: { start: 9 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 21 * 60 + 30 },
};
const STANDARD: StandardWindow[] = ['morning', 'afternoon', 'evening'];

export interface DeliveryWindow {
  /** What the order stores: "HH:MM-HH:MM". */
  key: string;
  start: number;
  end: number;
  /** A standard window's name (translated by the app), the kitchen's own session name, or null (shown as the hours). */
  name: StandardWindow | null;
  label: string | null;
}

export interface DeliveryDay {
  /** Days after today, Pakistan time: 0 is today. */
  offset: number;
  /** YYYY-MM-DD, Pakistan time. */
  date: string;
  windows: DeliveryWindow[];
}

export interface WindowSchedule {
  scheduleMode: string;
  operatingHours: unknown;
  minPrepTimeMinutes?: number | null;
  orderCutoffTime?: string | null;
}

interface Session {
  name?: unknown;
  open: string;
  close: string;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function parseHHMM(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

const isSession = (s: unknown): s is Session =>
  !!s && typeof s === 'object' && !Number.isNaN(parseHHMM((s as Session).open)) && !Number.isNaN(parseHHMM((s as Session).close));

/** A session as one or two ranges within the day: an overnight session (18:00–02:00) keeps the part before midnight. */
function range(session: Session): { start: number; end: number } {
  const start = parseHHMM(session.open);
  const close = parseHHMM(session.close);
  return { start, end: close <= start ? 24 * 60 : close };
}

const window = (start: number, end: number, name: StandardWindow | null, label: string | null): DeliveryWindow => ({
  key: `${hhmm(start)}-${hhmm(end)}`,
  start,
  end,
  name,
  label,
});

/** The standard windows cut to one opening range; the range itself when none of them falls inside it. */
function clipStandard(open: { start: number; end: number }, label: string | null): DeliveryWindow[] {
  const cut = STANDARD.map((name) => {
    const w = LEGACY_WINDOWS[name];
    return window(Math.max(w.start, open.start), Math.min(w.end, open.end), name, null);
  }).filter((w) => w.end - w.start >= MIN_WINDOW_MINUTES);
  if (cut.length) return cut;
  return open.end - open.start >= MIN_WINDOW_MINUTES ? [window(open.start, open.end, null, label)] : [];
}

/** A session name worth showing: the settings form saves "Open" for a day with one session. */
const sessionLabel = (name: unknown) => (typeof name === 'string' && name.trim() && name.trim().toLowerCase() !== 'open' ? name.trim() : null);

/** The windows on one day of the week (0 is Sunday), before today's cut-offs. */
export function windowsOnWeekday(schedule: WindowSchedule, dayIndex: number): DeliveryWindow[] {
  const hours = (schedule.operatingHours && typeof schedule.operatingHours === 'object' ? schedule.operatingHours : {}) as {
    fixedDaily?: unknown;
    weekly?: Record<string, { closed?: boolean; sessions?: unknown[] } | undefined>;
  };
  if (schedule.scheduleMode === 'fixed_daily' && isSession(hours.fixedDaily)) {
    return clipStandard(range(hours.fixedDaily), null);
  }
  if (schedule.scheduleMode === 'per_day' && hours.weekly && typeof hours.weekly === 'object') {
    const day = hours.weekly[DAY_NAMES[dayIndex]];
    const sessions = !day || day.closed || !Array.isArray(day.sessions) ? [] : day.sessions.filter(isSession);
    if (sessions.length === 0) return [];
    if (sessions.length === 1) return clipStandard(range(sessions[0]), sessionLabel(sessions[0].name));
    return sessions
      .map((s) => ({ ...range(s), label: sessionLabel(s.name) }))
      .filter((r) => r.end - r.start >= MIN_WINDOW_MINUTES)
      .sort((a, b) => a.start - b.start)
      .map((r) => window(r.start, r.end, null, r.label));
  }
  // Open all day, or hours that could not be read: the standard windows.
  return STANDARD.map((name) => window(LEGACY_WINDOWS[name].start, LEGACY_WINDOWS[name].end, name, null));
}

function pktNow(now: Date) {
  const p = new Date(now.getTime() + PKT_OFFSET_MS);
  return { date: p.toISOString().slice(0, 10), minutes: p.getUTCHours() * 60 + p.getUTCMinutes(), dayIndex: p.getUTCDay() };
}

/** The windows still bookable today: the kitchen can cook in time, and its cut-off has not passed. */
function stillOpenToday(windows: DeliveryWindow[], schedule: WindowSchedule, minutesNow: number): DeliveryWindow[] {
  const cutoff = parseHHMM(schedule.orderCutoffTime);
  if (!Number.isNaN(cutoff) && minutesNow >= cutoff) return [];
  const ready = minutesNow + (schedule.minPrepTimeMinutes ?? 0);
  return windows.filter((w) => w.end > ready);
}

/** The days a customer can book, `minDays` to `maxDays` ahead, each with its windows; days without any are left out. */
export function deliveryDays(schedule: WindowSchedule, minDays: number, maxDays: number, now: Date = new Date()): DeliveryDay[] {
  const today = pktNow(now);
  const days: DeliveryDay[] = [];
  for (let offset = Math.max(0, minDays); offset <= Math.max(minDays, maxDays); offset++) {
    const date = new Date(Date.parse(today.date) + offset * DAY_MS).toISOString().slice(0, 10);
    const all = windowsOnWeekday(schedule, (today.dayIndex + offset) % 7);
    const windows = offset === 0 ? stillOpenToday(all, schedule, today.minutes) : all;
    if (windows.length) days.push({ offset, date, windows });
  }
  return days;
}

/** The first and last day a kitchen can be booked for: its own limits, else today (tomorrow for pre-orders) to a week. */
export function bookingRange(seller: { preOrderOnly: boolean; advanceBookingMinDays: number | null; advanceBookingMaxDays: number | null }, takesPreOrdersNow = false) {
  const min = seller.advanceBookingMinDays ?? (seller.preOrderOnly || takesPreOrdersNow ? 1 : 0);
  const max = seller.advanceBookingMaxDays ?? Math.max(min, DEFAULT_MAX_DAYS_AHEAD);
  return { min, max };
}

/** When a stored window starts, in minutes after midnight: "12:00-15:00", or an old named window. */
export function windowStartMinutes(key: string | null | undefined): number | undefined {
  if (!key) return undefined;
  if (key in LEGACY_WINDOWS) return LEGACY_WINDOWS[key as StandardWindow].start;
  const start = parseHHMM(key.split('-')[0]);
  return Number.isNaN(start) ? undefined : start;
}

/**
 * Why this window can't be booked for this day, or null when it can. `date` is YYYY-MM-DD (today when none); `key` is a
 * window from deliveryDays, or an old named window from an app that has not reloaded since (checked by its hours). An
 * order with no window only has its day checked.
 */
export function windowProblem(schedule: WindowSchedule, key: string | undefined, date: string | undefined, now: Date = new Date()): string | null {
  const today = pktNow(now);
  const day = date ? new Date(date).toISOString().slice(0, 10) : today.date;
  if (day < today.date) return 'The delivery day has already passed. Please choose another day.';
  if (!key) return null;
  const offset = Math.round((Date.parse(day) - Date.parse(today.date)) / DAY_MS);
  const all = windowsOnWeekday(schedule, (today.dayIndex + offset) % 7);
  const legacy = key in LEGACY_WINDOWS ? LEGACY_WINDOWS[key as StandardWindow] : null;
  const chosen = legacy ? window(legacy.start, legacy.end, key as StandardWindow, null) : all.find((w) => w.key === key);
  if (!chosen) return 'The kitchen does not deliver at that time on that day. Please choose another time.';
  if (offset === 0 && stillOpenToday([chosen], schedule, today.minutes).length === 0) {
    return 'That delivery time has passed or is too soon for the kitchen to cook. Please choose a later one.';
  }
  return null;
}
