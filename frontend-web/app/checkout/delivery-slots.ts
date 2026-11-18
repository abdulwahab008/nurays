/**
 * Delivery days and windows at checkout come from the kitchen's own hours, worked out by the server
 * (backend utils/deliveryWindows.ts). This file keeps the Pakistan-time helpers the screens need to show them.
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The calendar day in Pakistan, `daysAhead` days from now, as YYYY-MM-DD. */
export function pktDateString(now: Date, daysAhead = 0): string {
  return new Date(now.getTime() + PKT_OFFSET_MS + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A time of day from minutes after midnight: "9 am", "12 pm", "9:30 pm", "12 am" for midnight. */
export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/** "10 am – 12 pm", held left to right inside an Urdu line (as formatTime does). */
export function windowHours(start: number, end: number): string {
  return `\u2066${clock(start)} – ${clock(end)}\u2069`;
}

/** The hours of a stored window, "12:00-15:00"; null for an old named one ("morning"), which has its own words. */
export function storedWindowHours(key: string): string | null {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(key);
  if (!m) return null;
  return windowHours(Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4]));
}
