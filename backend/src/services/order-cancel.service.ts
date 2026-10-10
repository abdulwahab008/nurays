import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { releasePromotionUsage } from './promotion.service';
import { issueRefund, IssuedRefund } from './refund.service';
import { releaseHubAllocations } from './hub-allocation.service';
import { cancelOpenDelivery, notifyDeliveryCancelled, CancelledDelivery } from './delivery-lifecycle.service';

/** Cancelling an order, and what a cancellation sets right (stock, promotions, money, the delivery job). */
export class OrderCancellation {
  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Customer can only cancel while order is still pending (before seller has accepted)
    if (order.orderStatus !== 'pending') {
      throw new AppError(
        `Order cannot be cancelled. Current status: ${order.orderStatus}. Cancellation is only allowed before the seller confirms.`,
        400,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    // Cancel order and restore stock
    let refundIssued = null as IssuedRefund | null;
    let cancelledDelivery = null as CancelledDelivery | null;
    const cancelledOrder = await prisma.$transaction(async (tx) => {
      // Claim the cancellation: the "still pending" check above ran before this
      // transaction, so a seller accepting at the same instant (or a second
      // cancel) must not both win — otherwise the order is revived after its
      // stock was returned, or its stock is returned twice.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, customerId: userId, orderStatus: 'pending' },
        data: {
          orderStatus: 'cancelled',
          cancellationReason: reason,
          cancelledBy: 'customer',
        },
      });
      if (claimed.count > 0) cancelledDelivery = await cancelOpenDelivery(tx, orderId, `Cancelled by the customer: ${reason}`);
      if (claimed.count === 0) {
        throw new AppError('Order can no longer be cancelled', 409, 'ORDER_NOT_CANCELLABLE');
      }
      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      // Items a seller already cancelled were restocked at that time; only
      // return stock for what is still live. Read before the cascade below.
      const liveItems = await tx.orderItem.findMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
      });

      // Cascade cancellation to all order items so the seller UI doesn't
      // show stale "Pending/Confirmed/Preparing" rows with action buttons
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'cancelled' },
      });

      // Restore stock. A variant item drew from its own stock pool at order
      // time, so it goes back there — not onto the shared product-level stock.
      for (const item of liveItems) {
        if (!item.productId) continue;
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: {
            ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
            totalOrders: { decrement: 1 },
          },
        });
      }

      // A cancelled order shouldn't keep consuming the promo's quota.
      await releasePromotionUsage(tx, orderId);

      // Hub units this order took go back into the batches they came from.
      await releaseHubAllocations(tx, orderId, { reason: `Order ${order.orderNumber} cancelled by customer`, performedBy: userId });

      // A paid order (wallet payment, or a gateway payment that already cleared)
      // is owed its money back: wallet orders are refunded instantly, the rest
      // are queued for the admin to send.
      refundIssued = await issueRefund(tx, orderId, {
        reason: `Order cancelled by customer: ${reason}`,
        createdBy: userId,
      });


      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'cancelled',
          notes: `Cancelled by customer. Reason: ${reason}`,
          changedBy: userId,
        },
      });

      return updatedOrder;
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(cancelledOrder.id, 'cancelled', userId);
    notifyDeliveryCancelled(cancelledDelivery);

    return {
      orderId: cancelledOrder.id,
      status: cancelledOrder.orderStatus,
      refundAmount: refundIssued?.amount ?? 0,
      refundStatus: refundIssued
        ? refundIssued.status === 'completed'
          ? 'refunded_to_wallet'
          : 'pending_manual_transfer'
        : 'not_required',
    };
  }
}

export default new OrderCancellation();
