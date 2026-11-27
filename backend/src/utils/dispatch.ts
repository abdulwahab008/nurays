/**
 * Which rider a new delivery job goes to. Pure functions, no database: the dispatch service feeds
 * them real data and applies the result.
 *
 * Nuray's riders are its own and each serves a community (an admin sets it; usually one or two
 * riders per community). A new job goes, in this order, to:
 *  1. a rider already carrying one job whose drop-off is in the same area (same community, or
 *     within 2.5 km) and whose pickup is not far from this one: one trip serves both;
 *  2. otherwise the rider nearest the kitchen, by where their phone last was (only a recent position
 *     counts), a rider with no job before one already carrying one;
 *  3. riders whose position is not known come after every rider whose position is, and among them:
 *     a rider who serves the kitchen's community, then one who serves the customer's, then anyone,
 *     fewer jobs first within each.
 * Ties go to whoever has delivered least today, so work is shared.
 * A rider is never offered a job if they are off duty, already have two, would pass their cash limit,
 * or already handed this job back (the caller leaves those out).
 */
import { haversineKm } from './deliveryFee';

export const MAX_ACTIVE_JOBS = 2;
/** Drop-offs this close count as the same delivery area. */
export const SAME_AREA_DROPOFF_KM = 2.5;
/** Pickups this close can be collected on one trip. */
export const BATCH_PICKUP_KM = 4;
/** A rider's position older than this is not used: they may have moved anywhere since. */
export const RIDER_POSITION_FRESH_MS = 10 * 60_000;

export interface Point {
  lat: number | null;
  lng: number | null;
}

export interface JobEnds {
  pickup: Point;
  dropoff: Point;
  pickupCommunityId: string | null;
  dropoffCommunityId: string | null;
}

export interface DispatchJob extends JobEnds {
  /** Cash the rider would take at the door for this job (0 when prepaid). */
  cashToTake: number;
}

export interface DispatchCandidate {
  id: string;
  communityId: string | null;
  /** Where the rider is now, or null when no recent position is known (the caller drops stale ones). */
  position: Point | null;
  active: JobEnds[];
  cashHeld: number;
  cashToCollect: number;
  cashLimit: number;
  deliveriesToday: number;
}

const known = (p: Point): p is { lat: number; lng: number } => p.lat != null && p.lng != null;

function gapKm(a: Point, b: Point): number | null {
  return known(a) && known(b) ? haversineKm(a.lat, a.lng, b.lat, b.lng) : null;
}

/** Whether one trip can serve both jobs: drop-offs in the same area, pickups not far apart. */
export function canShareTrip(carried: JobEnds, job: JobEnds): boolean {
  const dropGap = gapKm(carried.dropoff, job.dropoff);
  const sameDropArea =
    dropGap != null
      ? dropGap <= SAME_AREA_DROPOFF_KM
      : carried.dropoffCommunityId != null && carried.dropoffCommunityId === job.dropoffCommunityId;
  if (!sameDropArea) return false;
  const pickGap = gapKm(carried.pickup, job.pickup);
  if (pickGap != null) return pickGap <= BATCH_PICKUP_KM;
  return carried.pickupCommunityId != null && carried.pickupCommunityId === job.pickupCommunityId;
}

export type DispatchReason = 'shares_a_trip' | 'nearest' | 'serves_pickup_community' | 'serves_dropoff_community' | 'available';

export interface DispatchChoice {
  riderId: string;
  reason: DispatchReason;
}

/** The rider this job should go to, or null when nobody can take it right now. */
export function chooseRider(job: DispatchJob, candidates: DispatchCandidate[]): DispatchChoice | null {
  const ranked: Array<{ c: DispatchCandidate; tier: number; km: number | null; reason: DispatchReason }> = [];
  for (const c of candidates) {
    if (c.active.length >= MAX_ACTIVE_JOBS) continue;
    if (job.cashToTake > 0 && c.cashHeld + c.cashToCollect + job.cashToTake > c.cashLimit) continue;
    const km = c.position ? gapKm(c.position, job.pickup) : null;
    let tier = 4;
    let reason: DispatchReason = 'available';
    if (c.communityId && c.communityId === job.pickupCommunityId) {
      tier = 2;
      reason = 'serves_pickup_community';
    } else if (c.communityId && c.communityId === job.dropoffCommunityId) {
      tier = 3;
      reason = 'serves_dropoff_community';
    }
    if (km != null) reason = 'nearest';
    if (c.active.length === 1 && canShareTrip(c.active[0], job)) {
      tier = 1;
      reason = 'shares_a_trip';
    }
    ranked.push({ c, tier, km, reason });
  }
  if (ranked.length === 0) return null;
  const shares = (r: { tier: number }) => (r.tier === 1 ? 0 : 1);
  const unknown = (r: { km: number | null }) => (r.km == null ? 1 : 0);
  ranked.sort(
    (a, b) =>
      shares(a) - shares(b) ||
      unknown(a) - unknown(b) ||
      // Both positions known: a free rider before a busy one, then the nearer. Neither known: the old community steps.
      (a.km != null && b.km != null
        ? a.c.active.length - b.c.active.length || a.km - b.km
        : a.tier - b.tier || a.c.active.length - b.c.active.length) ||
      a.c.deliveriesToday - b.c.deliveriesToday ||
      a.c.id.localeCompare(b.c.id)
  );
  return { riderId: ranked[0].c.id, reason: ranked[0].reason };
}

/** Where a job is, for matching it to riders: the kitchen's and the customer's communities, and the kitchen's city. */
export interface JobArea {
  pickupCommunityId: string | null;
  dropoffCommunityId: string | null;
  city: string | null;
}

/**
 * Whether a job is in a rider's area: it is picked up or delivered in the community they serve, or the kitchen is in
 * their city. A job whose city is not known is not held back. Without this, a rider on duty in Karachi was given a
 * Lahore order whenever no Lahore rider was free.
 */
export function inRiderArea(rider: { communityId: string | null; city: string | null }, job: JobArea): boolean {
  if (rider.communityId && (rider.communityId === job.pickupCommunityId || rider.communityId === job.dropoffCommunityId)) return true;
  if (!job.city) return true;
  return !!rider.city && rider.city.trim().toLowerCase() === job.city.trim().toLowerCase();
}
