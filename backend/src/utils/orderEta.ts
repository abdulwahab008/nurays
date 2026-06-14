import { haversineKm } from './deliveryFee';

/**
 * Heuristic delivery ETA: now + prep time + travel time + buffer.
 *
 * v1 uses fixed assumptions (city avg speed, default prep). Later these
 * constants can be replaced with per-seller / per-area medians learned from
 * OrderStatusHistory timestamps — same formula, data-driven inputs.
 */
const DEFAULT_PREP_MINUTES = 30;
const AVG_CITY_SPEED_KMH = 18;
const FALLBACK_TRAVEL_MINUTES = 30; // when coordinates are missing
const DISPATCH_BUFFER_MINUTES = 10;

interface EtaOrigin {
  latitude?: number | null;
  longitude?: number | null;
}

interface EtaInput {
  /** Per-item preparation times in minutes (nulls allowed). */
  prepMinutes: Array<number | null | undefined>;
  /** Slowest origin (seller/hub) coordinates per item. */
  origins: EtaOrigin[];
  destination: { latitude?: number | null; longitude?: number | null };
  from?: Date;
}

export function estimateDeliveryAt(input: EtaInput): Date {
  const base = input.from ?? new Date();

  const prep = input.prepMinutes.reduce<number>(
    (max, m) => Math.max(max, m && m > 0 ? m : DEFAULT_PREP_MINUTES),
    DEFAULT_PREP_MINUTES,
  );

  const dest = input.destination;
  let travel = FALLBACK_TRAVEL_MINUTES;
  if (dest.latitude != null && dest.longitude != null) {
    let maxKm = 0;
    for (const o of input.origins) {
      if (o.latitude == null || o.longitude == null) continue;
      maxKm = Math.max(
        maxKm,
        haversineKm(Number(o.latitude), Number(o.longitude), Number(dest.latitude), Number(dest.longitude)),
      );
    }
    if (maxKm > 0) {
      travel = (maxKm / AVG_CITY_SPEED_KMH) * 60;
    }
  }

  const totalMinutes = Math.round(prep + travel + DISPATCH_BUFFER_MINUTES);
  return new Date(base.getTime() + totalMinutes * 60 * 1000);
}
