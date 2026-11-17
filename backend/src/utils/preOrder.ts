/**
 * When a kitchen starts on an order booked for a delivery window.
 *
 * The kitchen sets how long before the window it starts (its lead time, 60 minutes unless it chose another). Until
 * then nothing is due: no rider is sent, and the order is not cancelled for not being accepted. An order whose start
 * has already passed when it is placed (the usual order for the window that is open now) is due at once.
 */

/** When each delivery window opens, in minutes after midnight Pakistan time (checkout shows the same hours). */
export const SLOT_START_MINUTES: Record<string, number> = { morning: 9 * 60, afternoon: 12 * 60, evening: 17 * 60 };

export const DEFAULT_PRE_ORDER_LEAD_MINUTES = 60;
/** The longest lead a kitchen may set: the earliest window opens at 9:00, so the start stays on the delivery day. */
export const MAX_PRE_ORDER_LEAD_MINUTES = 8 * 60;

const PKT_OFFSET_MINUTES = 5 * 60;

interface BookedOrder {
  /** The delivery day, as the database gives a date: midnight UTC of that day. */
  deliverySlotDate: Date | null;
  deliverySlotTime: string | null;
}

/**
 * The moment the kitchen starts on a booked order, or null for an order with no delivery day. A day without a window
 * starts when the day does in Pakistan.
 */
export function workStartsAt(order: BookedOrder, leadMinutes: number | null | undefined): Date | null {
  if (!order.deliverySlotDate) return null;
  const opens = order.deliverySlotTime ? SLOT_START_MINUTES[order.deliverySlotTime] : undefined;
  const minutesIntoDay = opens === undefined ? 0 : opens - (leadMinutes ?? DEFAULT_PRE_ORDER_LEAD_MINUTES);
  return new Date(order.deliverySlotDate.getTime() + (minutesIntoDay - PKT_OFFSET_MINUTES) * 60_000);
}

/** Whether the kitchen's start on this order is still ahead. */
export function startsLater(order: BookedOrder, leadMinutes: number | null | undefined, now: Date = new Date()): boolean {
  const at = workStartsAt(order, leadMinutes);
  return at !== null && at > now;
}
