/**
 * The seller columns getDeliveryFeeForSeller needs to apply community rules
 * (home community, cross-community opt-out, per-community fees). Spread into
 * any Prisma `seller` select that feeds the fee calculator.
 */
export const SELLER_COMMUNITY_DELIVERY_SELECT = {
  communityId: true,
  deliveryProvider: true,
  allowCrossCommunity: true,
  community: { select: { crossCommunityEnabled: true } },
  communityDeliveries: {
    select: {
      communityId: true,
      fee: true,
      freeAbove: true,
      minOrderAmount: true,
      isEnabled: true,
    },
  },
} as const;
