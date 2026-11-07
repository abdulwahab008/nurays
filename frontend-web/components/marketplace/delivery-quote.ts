/**
 * What delivering from a kitchen to the customer costs and how long it takes, as GET /sellers works it out when it is
 * told the customer's area (customerCommunityId) or address (customerLat/customerLng). The same quote the dish cards show.
 */
import type { PublicSeller } from '@/lib/services/seller.service';

export interface DeliveryQuote {
  deliverable: boolean;
  fee: number;
  distanceKm: number | null;
  reason: string | null;
  estimatedMinMinutes: number | null;
  estimatedMaxMinutes: number | null;
}

export type QuotedSeller = PublicSeller & { delivery?: DeliveryQuote | null };

/** The query that asks GET /sellers for each kitchen's quote; empty when the area is not known. */
export function quoteParams(communityId?: string | null): Record<string, string> {
  return communityId ? { customerCommunityId: communityId } : {};
}

/**
 * The kitchens a customer in this area can order from: the area's own kitchens first, then the others that deliver
 * there. A kitchen that does not deliver to the area is left out. Without an area the list is unchanged.
 */
export function kitchensForArea<T extends QuotedSeller>(sellers: T[], communityId?: string | null): T[] {
  if (!communityId) return sellers;
  const inArea = sellers.filter((s) => s.community?.id === communityId);
  const nearby = sellers.filter((s) => s.community?.id !== communityId && s.delivery?.deliverable === true);
  return [...inArea, ...nearby];
}

/** The fee and time as numbers, or null when the kitchen does not deliver there or nothing was quoted. */
export function quoteOf(delivery: DeliveryQuote | null | undefined): { fee: number; min: number | null; max: number | null } | null {
  if (!delivery?.deliverable) return null;
  return { fee: delivery.fee, min: delivery.estimatedMinMinutes, max: delivery.estimatedMaxMinutes };
}
