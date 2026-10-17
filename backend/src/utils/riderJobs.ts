/** Small helpers about a rider's jobs, shared by the rider and dispatch services. */
import { haversineKm } from './deliveryFee';
import { cashAtDoor } from './paymentCustody';
import { finiteOrNull } from './numbers';

/** A job's two ends, or nulls where a location isn't known (never a made-up one). */
export function endsOf(d: { pickupLatitude?: unknown; pickupLongitude?: unknown; deliveryLatitude?: unknown; deliveryLongitude?: unknown }) {
  return {
    pickupLat: finiteOrNull(d.pickupLatitude),
    pickupLng: finiteOrNull(d.pickupLongitude),
    deliveryLat: finiteOrNull(d.deliveryLatitude),
    deliveryLng: finiteOrNull(d.deliveryLongitude),
  };
}

/** Cash the rider will take at the door on jobs they already have (unpaid cash orders). */
export function cashToCollect(jobs: Array<{ order: { paymentMethod: string; paymentStatus: string; totalAmount: unknown } }>) {
  return jobs.reduce((sum, d) => sum + cashAtDoor(d.order), 0);
}

export const PAYMENT_INCLUDE = { order: { select: { paymentMethod: true, paymentStatus: true, totalAmount: true } } } as const;

export const ROUTE_BONUS = 100;

/**
 * Route bonus for taking a second job along the way: pickups within 1.5 km and drop-offs
 * within 2.5 km of the rider's one active job. Needs both jobs' locations.
 */
export function routeMatch(active: Parameters<typeof endsOf>[0] | null, candidate: Parameters<typeof endsOf>[0]) {
  if (!active) return null;
  const a = endsOf(active);
  const c = endsOf(candidate);
  if ([a.pickupLat, a.pickupLng, a.deliveryLat, a.deliveryLng, c.pickupLat, c.pickupLng, c.deliveryLat, c.deliveryLng].some((v) => v == null)) return null;
  const pickupGapKm = haversineKm(a.pickupLat!, a.pickupLng!, c.pickupLat!, c.pickupLng!);
  const dropoffGapKm = haversineKm(a.deliveryLat!, a.deliveryLng!, c.deliveryLat!, c.deliveryLng!);
  return pickupGapKm <= 1.5 && dropoffGapKm <= 2.5 ? { bonus: ROUTE_BONUS, corridorDistanceKm: Math.round(pickupGapKm * 10) / 10 } : null;
}


/**
 * The drop-off as a stored or pushed notification may show it: the area and city only. The
 * street and door stay in the job itself, which the rider sees while the job is theirs; a
 * notification outlives the job (and shows on a locked screen), so it never carries them.
 */
export function dropoffAreaOf(order: {
  deliveryAddressSnapshot?: unknown;
  deliveryAddress?: { area?: string | null; city?: string | null } | null;
}): string {
  const snap = order.deliveryAddressSnapshot && typeof order.deliveryAddressSnapshot === 'object' ? (order.deliveryAddressSnapshot as { area?: unknown; city?: unknown }) : null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const area = text(snap?.area) ?? text(order.deliveryAddress?.area);
  const city = text(snap?.city) ?? text(order.deliveryAddress?.city);
  return [area, city].filter(Boolean).join(', ');
}

/** The text of the "new delivery assigned to you" notification. */
export function assignmentMessage(input: { orderNumber: string; pickupAddress: string; dropoffArea: string; cashToCollect: number }): string {
  const to = input.dropoffArea ? `deliver to ${input.dropoffArea}` : 'open the job for the drop-off';
  const cash = input.cashToCollect > 0 ? ` Collect Rs ${Math.round(input.cashToCollect)} in cash.` : '';
  return `Order #${input.orderNumber}: pick up from ${input.pickupAddress}, ${to}.${cash}`;
}
