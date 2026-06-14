/**
 * Order/order-item status state machine.
 *
 * Tracking an order is a finite state machine, not an algorithm: the seller
 * advances each item through a fixed chain, and the order's overall status is
 * derived from its items (the order is only as far along as its slowest item).
 *
 * Self-delivery model: the seller owns the whole chain up to `delivered`.
 * When a rider/hub app is added later, the `dispatched -> delivered` leg can be
 * reassigned to that role without changing this map.
 */

export type ItemStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

// Legal next states for each item status. Empty = terminal.
const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
  rejected: [],
};

// Forward progress ranking, used to derive the order status from its items
// (lowest rank among still-active items wins). cancelled/rejected are excluded.
const PROGRESS_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  dispatched: 4,
  delivered: 5,
};

export function isValidItemStatus(status: string): status is ItemStatus {
  return status in ITEM_TRANSITIONS;
}

export function canTransitionItem(from: string, to: string): boolean {
  if (!isValidItemStatus(from) || !isValidItemStatus(to)) return false;
  return ITEM_TRANSITIONS[from].includes(to);
}

/** Human-friendly list of allowed next steps (for error messages / UI). */
export function allowedItemNextSteps(from: string): ItemStatus[] {
  return isValidItemStatus(from) ? ITEM_TRANSITIONS[from] : [];
}

/**
 * Derive the order's status from its item statuses: the order sits at the
 * least-advanced active item. If every item is cancelled/rejected the order is
 * cancelled; if all active items are delivered the order is delivered.
 */
export function deriveOrderStatus(itemStatuses: string[]): string | null {
  const active = itemStatuses.filter((s) => s !== 'cancelled' && s !== 'rejected');
  if (active.length === 0) {
    return itemStatuses.length > 0 ? 'cancelled' : null;
  }
  let minRank = Infinity;
  let minStatus: string | null = null;
  for (const s of active) {
    const rank = PROGRESS_RANK[s];
    if (rank === undefined) continue;
    if (rank < minRank) {
      minRank = rank;
      minStatus = s;
    }
  }
  return minStatus;
}
