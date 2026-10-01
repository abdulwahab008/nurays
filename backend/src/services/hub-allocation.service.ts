import { AppError } from '../middleware/errorHandler';
import { sellableCutoff } from '../utils/hubStock';

// Accept the interactive-transaction client without importing prisma types here.
type Tx = any;

interface LockedBatch {
  id: string;
  quantity: number;
  batch_number: string | null;
  expiry_date: Date;
}

/**
 * Take `quantity` units of a product from a hub, first-expired-first-out, inside
 * the caller's transaction.
 *
 *  - Only sellable batches are used (available, in stock, enough shelf life left):
 *    an expired batch used to sort FIRST and be sold first.
 *  - The candidate rows are locked (SELECT ... FOR UPDATE), so two concurrent
 *    orders can't both read the same quantity and each take it.
 *  - Falling short throws: the order used to be created anyway with only part of
 *    the units allocated (or none), leaving hub stock and the order out of step.
 *  - What was taken is recorded per batch (HubBatchAllocation) so a cancel can
 *    return it to the same batches.
 */
export async function allocateHubStock(
  tx: Tx,
  opts: { orderId: string; orderNumber: string; hubId: string; productId: string; productName: string; quantity: number; performedBy: string }
) {
  const batches: LockedBatch[] = await tx.$queryRaw`
    SELECT id, quantity, batch_number, expiry_date
    FROM hub_inventory
    WHERE hub_id = ${opts.hubId}
      AND product_id = ${opts.productId}
      AND status = 'available'
      AND quantity > 0
      AND expiry_date > ${sellableCutoff()}
    ORDER BY expiry_date ASC, created_at ASC
    FOR UPDATE`;

  let remaining = opts.quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    const newQty = batch.quantity - take;

    await tx.hubInventory.update({
      where: { id: batch.id },
      // A batch that's been emptied is marked reserved (depleted), as before.
      data: { quantity: newQty, status: newQty === 0 ? 'reserved' : 'available' },
    });
    await tx.hubBatchAllocation.create({
      data: { orderId: opts.orderId, productId: opts.productId, hubInventoryId: batch.id, quantity: take },
    });
    await tx.hubInventoryLog.create({
      data: {
        hubInventoryId: batch.id,
        action: 'stock_out',
        quantityChange: -take,
        previousQuantity: batch.quantity,
        newQuantity: newQty,
        reason: `FEFO batch allocation for Order #${opts.orderNumber} (Batch: ${batch.batch_number || 'N/A'}, Expiry: ${new Date(batch.expiry_date).toISOString().slice(0, 10)})`,
        performedBy: opts.performedBy,
      },
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new AppError(
      `Insufficient hub stock for ${opts.productName}. Available: ${opts.quantity - remaining}`,
      400,
      'INSUFFICIENT_STOCK'
    );
  }
}

/**
 * Put back the hub stock an order took, into the batches it came from. Idempotent
 * (each allocation is released once), so cancel paths can call it freely.
 * `productIds` limits it to particular items (a seller cancelling its own items).
 * A depleted batch that this brings back into stock becomes available again —
 * unless it was quarantined or has expired in the meantime.
 */
export async function releaseHubAllocations(
  tx: Tx,
  orderId: string,
  opts: { productIds?: string[]; reason: string; performedBy: string }
) {
  const allocations = await tx.hubBatchAllocation.findMany({
    where: {
      orderId,
      releasedAt: null,
      ...(opts.productIds ? { productId: { in: opts.productIds } } : {}),
    },
  });

  for (const a of allocations) {
    // Claim first so two concurrent cancels can't both return the same units.
    const claimed = await tx.hubBatchAllocation.updateMany({
      where: { id: a.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const batch = await tx.hubInventory.findUnique({ where: { id: a.hubInventoryId } });
    if (!batch) continue;
    const newQty = batch.quantity + a.quantity;
    const stillSellable = batch.status === 'reserved' && new Date(batch.expiryDate) > new Date();
    await tx.hubInventory.update({
      where: { id: batch.id },
      data: { quantity: newQty, ...(stillSellable ? { status: 'available' } : {}) },
    });
    await tx.hubInventoryLog.create({
      data: {
        hubInventoryId: batch.id,
        action: 'adjustment',
        quantityChange: a.quantity,
        previousQuantity: batch.quantity,
        newQuantity: newQty,
        reason: opts.reason,
        performedBy: opts.performedBy,
      },
    });
  }
}
