'use client';

/**
 * What the kitchen's screens tell the new-order alert (SellerNewOrderNotification), kept here rather than sent as events:
 * the alert is loaded after the page, so a one-time event can fire before it listens. It reads this state when it
 * mounts, on every ring, and whenever it changes.
 */

let nowTabOpen = false;
const seenIds = new Set<string>();
let slot: HTMLElement | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeNewOrderAlert(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const newOrderAlertVersion = () => version;

/** The orders list's Now tab is on screen: it lists every new order with Accept and Reject, so the bell stays quiet. */
export function setNowTabOpen(open: boolean) {
  if (nowTabOpen === open) return;
  nowTabOpen = open;
  changed();
}

export const isNowTabOpen = () => nowTabOpen;

/** These new orders are on the kitchen's screen with Accept and Reject: the bell has done its job for them. */
export function markNewOrdersSeen(orderIds: string[]) {
  const fresh = orderIds.filter((id) => !seenIds.has(id));
  if (fresh.length === 0) return;
  fresh.forEach((id) => seenIds.add(id));
  changed();
}

export const isNewOrderSeen = (orderId: string) => seenIds.has(orderId);

function setSlot(el: HTMLElement | null) {
  slot = el;
  changed();
}

export const newOrderAlertSlot = () => slot;

/**
 * Where a page that already lists the new order (the dashboard, another order's page) wants the alert: one slim bar in
 * the page's flow, so it pushes the page down instead of covering its back link or its list.
 */
export function NewOrderAlertSlot() {
  return <div ref={setSlot} />;
}
