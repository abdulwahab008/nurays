import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

/**
 * Kitchens a buyer may see and order from: those in an area Nuray is live in. A kitchen with no area is in none
 * (there is no live area it could be delivering within), so it is left out too.
 */
export const IN_LIVE_AREA = { community: { is: { isActive: true } } } satisfies Prisma.SellerWhereInput;

/** Refuses an order (or a tray item) from a kitchen outside the live areas. */
export function assertInLiveArea(seller: { businessName: string; community?: { isActive: boolean } | null }) {
  if (!seller.community?.isActive) {
    throw new AppError(`${seller.businessName} is not taking orders: Nuray isn't in its area yet`, 400, 'SELLER_OUTSIDE_SERVICE_AREA');
  }
}
