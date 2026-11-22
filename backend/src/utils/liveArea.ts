import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { haversineKm } from './deliveryFee';

/**
 * Kitchens a buyer may see and order from: none in an area Nuray has switched off. A kitchen with no area is not gated,
 * as elsewhere without an area to measure by (communityService.pinOutsideEveryCommunity).
 */
export const IN_LIVE_AREA = { NOT: { community: { is: { isActive: false } } } } satisfies Prisma.SellerWhereInput;

/** Refuses an order (or a tray item) from a kitchen outside the live areas. */
export function assertInLiveArea(seller: { businessName: string; community?: { isActive: boolean } | null }) {
  if (seller.community && !seller.community.isActive) {
    throw new AppError(`${seller.businessName} is not taking orders: Nuray isn't in its area yet`, 400, 'SELLER_OUTSIDE_SERVICE_AREA');
  }
}

/** A restaurant is shown to, and takes orders from, only customers this close to it. Home kitchens follow their own area rules. */
export const RESTAURANT_RADIUS_KM = 5;

export type BuyerPoint = { lat: number; lng: number } | null;

/**
 * Where the customer is, for the restaurant rule: their address or phone location when sent, else the centre of the
 * area they chose, else unknown (and then no restaurant is shown).
 */
export async function buyerPoint(lat: number | null | undefined, lng: number | null | undefined, communityIdOrSlug?: string | null): Promise<BuyerPoint> {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  if (!communityIdOrSlug) return null;
  const area = await prisma.community.findFirst({
    where: { OR: [{ id: communityIdOrSlug }, { slug: communityIdOrSlug }] },
    select: { centerLatitude: true, centerLongitude: true },
  });
  return area ? { lat: Number(area.centerLatitude), lng: Number(area.centerLongitude) } : null;
}

/** True when a kitchen may be shown at this point: any non-restaurant, or a restaurant within the radius. */
export function restaurantReaches(
  seller: { businessType: string; latitude: unknown; longitude: unknown },
  point: BuyerPoint,
): boolean {
  if (seller.businessType !== 'restaurant') return true;
  if (!point || seller.latitude == null || seller.longitude == null) return false;
  return haversineKm(point.lat, point.lng, Number(seller.latitude), Number(seller.longitude)) <= RESTAURANT_RADIUS_KM;
}

/**
 * The seller filter for the restaurant rule, to put in an AND list (the live-area filter already uses NOT).
 * ponytail: one scan of all pinned restaurants per request; a PostGIS index if restaurants reach the thousands.
 */
export async function restaurantsNearWhere(point: BuyerPoint): Promise<Prisma.SellerWhereInput> {
  if (!point) return { businessType: { not: 'restaurant' } };
  const restaurants = await prisma.seller.findMany({
    where: { businessType: 'restaurant', latitude: { not: null }, longitude: { not: null } },
    select: { id: true, businessType: true, latitude: true, longitude: true },
  });
  const near = restaurants.filter((r) => restaurantReaches(r, point)).map((r) => r.id);
  return { OR: [{ businessType: { not: 'restaurant' } }, { id: { in: near } }] };
}

/** Refuses a delivery from a restaurant further than the radius from the delivery address. */
export function assertRestaurantReaches(
  seller: { businessName: string; businessType: string; latitude: unknown; longitude: unknown },
  point: BuyerPoint,
) {
  if (!restaurantReaches(seller, point)) {
    throw new AppError(
      `${seller.businessName} only delivers within ${RESTAURANT_RADIUS_KM} km, and this address is further away`,
      400,
      'RESTAURANT_TOO_FAR',
    );
  }
}
