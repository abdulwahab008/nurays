import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

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
