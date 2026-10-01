/**
 * What counts as sellable hub stock. Frozen goods that are about to expire can't
 * survive packing and delivery, so a batch must have at least this much shelf
 * life left to be offered or allocated.
 */
export const HUB_MIN_SHELF_LIFE_MS = 24 * 60 * 60 * 1000;

/** Batches expiring at or before this instant are not sellable. */
export const sellableCutoff = (now: number = Date.now()): Date => new Date(now + HUB_MIN_SHELF_LIFE_MS);

/** Prisma filter for hub batches that can be shown, counted and allocated. */
export const sellableBatchWhere = (now: number = Date.now()) => ({
  status: 'available',
  quantity: { gt: 0 },
  expiryDate: { gt: sellableCutoff(now) },
});
