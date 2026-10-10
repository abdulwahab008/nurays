import { realPhoneOrNull } from '../utils/otp';
import { codCollectorOf, isCashAtDoor } from '../utils/paymentCustody';
import { presentFile } from '../storage';
import { cancelOpenDelivery, notifyDeliveryCancelled, reopenDeliveryData, CancelledDelivery } from './delivery-lifecycle.service';
import { postDeliverySoon } from './dispatch.service';
import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import socketManager from '../config/socket';
import riderService from './rider.service';
import { releasePromotionUsage } from './promotion.service';
import { issueRefund, IssuedRefund } from './refund.service';
import ledgerService from './ledger.service';
import { postDeliveryEntries } from './rider-ledger.service';
import { releaseHubAllocations } from './hub-allocation.service';
import { logger } from '../utils/logger';

// The main happy-path order pipeline — admin can only move an order exactly
// one step forward at a time (no skipping straight to 'dispatched'/'delivered',
// which would leave the rider layer never dispatched for that order).
const ORDER_FORWARD_SEQUENCE = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'in_transit',
  'delivered',
  'completed',
];

function isValidOrderStatusTransition(from: string, to: string): boolean {
  if (to === 'refunded') return from !== 'refunded';
  if (to === 'cancelled') return !['delivered', 'completed', 'cancelled', 'refunded'].includes(from);
  // A rider or self-delivering seller can report a failed delivery once the
  // order is actually out for delivery — resolved from there via cancelOrder
  // (refund) or retryDelivery (send it back out).
  if (to === 'delivery_failed') return ['dispatched', 'in_transit'].includes(from);
  const fromIndex = ORDER_FORWARD_SEQUENCE.indexOf(from);
  const toIndex = ORDER_FORWARD_SEQUENCE.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex === fromIndex + 1;
}

export class AdminOrderService {
  /**
   * Get all orders (admin)
   */
  async getAllOrders(filters: {
    page?: number;
    limit?: number;
    orderStatus?: string;
    paymentStatus?: string;
    customerId?: string;
    sellerId?: string;
    dateFrom?: string;
    dateTo?: string;
    orderNumber?: string;
  }) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const where: any = {};

    if (filters.orderStatus) {
      where.orderStatus = filters.orderStatus;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.orderNumber) {
      where.orderNumber = { contains: filters.orderNumber, mode: 'insensitive' };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    // A kitchen is named by its own id, the one every row of this list carries; the id of the account that owns
    // it is accepted too, as before. Either way the orders are those with a dish from that kitchen.
    if (filters.sellerId) {
      const seller = await prisma.seller.findFirst({
        where: { OR: [{ id: filters.sellerId }, { userId: filters.sellerId }] },
      });

      // An unknown seller filters to nothing (it used to be ignored, listing every order).
      if (seller) where.items = { some: { sellerId: seller.id } };
      else where.id = { in: [] };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          items: {
            include: {
              seller: {
                select: {
                  id: true,
                  businessName: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer
          ? {
              id: order.customer.id,
              email: order.customer.email,
              phone: realPhoneOrNull(order.customer.phone),
              profile: order.customer.profile ? { fullName: order.customer.profile.fullName } : undefined,
              name: order.customer.profile?.fullName || null,
            }
          : null,
        totalAmount: Number(order.totalAmount),
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        itemsCount: order._count.items,
        sellersCount: new Set(order.items.map((item) => item.sellerId)).size,
        createdAt: order.createdAt,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        deliveredAt: order.deliveredAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get order details (admin)
   */
  async getOrderDetails(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            emailVerified: true,
            phoneVerified: true,
            createdAt: true,
            profile: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                businessNameUrdu: true,
                isVerified: true,
              },
            },
          },
        },
        deliveryAddress: true,
        hub: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            order: {
              select: {
                orderNumber: true,
              },
            },
          },
        },
        delivery: {
          include: {
            rider: {
              select: {
                id: true,
              },
            },
          },
        },
        promotionUsages: {
          include: {
            promotion: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        refunds: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Everything else that happened around this order, for investigating a complaint or a dispute.
    const actorIds = [...new Set(order.statusHistory.map((h) => h.changedBy).filter((id): id is string => !!id))];
    const [actors, riderUser, paymentAttempts, walletTransactions, ledgerEntries, riderLedgerEntries, tickets, adminActions] = await Promise.all([
      actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, userType: true, email: true, profile: { select: { fullName: true } } } }) : Promise.resolve([]),
      order.delivery?.rider ? prisma.rider.findUnique({ where: { id: order.delivery.rider.id }, select: { vehicleType: true, vehicleNumber: true, userId: true } }) : Promise.resolve(null),
      prisma.paymentAttempt.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true, gateway: true, tracker: true, amount: true, status: true, settledVia: true, paidAt: true, createdAt: true } }),
      prisma.walletTransaction.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true, transactionType: true, amount: true, status: true, description: true, createdAt: true } }),
      prisma.ledgerEntry.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true, transactionType: true, accountType: true, entryType: true, amount: true, description: true, createdAt: true } }),
      prisma.riderLedgerEntry.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, amount: true, note: true, createdAt: true } }),
      prisma.supportTicket.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: { id: true, ticketNumber: true, subject: true, status: true, priority: true, createdAt: true } }),
      prisma.auditLog.findMany({ where: { entityId: orderId }, orderBy: { createdAt: 'asc' }, take: 50, select: { id: true, action: true, responseStatus: true, requestData: true, createdAt: true, user: { select: { email: true, profile: { select: { fullName: true } } } } } }),
    ]);
    const riderPerson = riderUser ? await prisma.user.findUnique({ where: { id: riderUser.userId }, select: { phone: true, email: true, profile: { select: { fullName: true } } } }) : null;
    const actorName = new Map(actors.map((a) => [a.id, `${a.profile?.fullName || a.email || a.id} (${a.userType})`]));

    return {
      ...order,
      paymentProofUrl: await presentFile(order.paymentProofUrl),
      statusHistory: order.statusHistory.map((h) => ({ ...h, changedByName: h.changedBy ? actorName.get(h.changedBy) ?? null : null })),
      investigation: {
        rider: riderUser ? { name: riderPerson?.profile?.fullName ?? null, phone: realPhoneOrNull(riderPerson?.phone), email: riderPerson?.email ?? null, vehicle: [riderUser.vehicleType, riderUser.vehicleNumber].filter(Boolean).join(' ') } : null,
        paymentAttempts: paymentAttempts.map((a) => ({ ...a, amount: Number(a.amount) })),
        walletTransactions: walletTransactions.map((w) => ({ ...w, amount: Number(w.amount) })),
        ledgerEntries: ledgerEntries.map((l) => ({ ...l, amount: Number(l.amount) })),
        riderLedgerEntries: riderLedgerEntries.map((l) => ({ ...l, amount: Number(l.amount) })),
        supportTickets: tickets,
        adminActions: adminActions.map((a) => ({ id: a.id, action: a.action, status: a.responseStatus, details: a.requestData, createdAt: a.createdAt, admin: a.user?.profile?.fullName || a.user?.email || null })),
      },
      refunds: order.refunds.map((r) => ({ ...r, amount: Number(r.amount) })),
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
    };
  }

  /**
   * Update order status (admin)
   */
  async updateOrderStatus(
    orderId: string,
    adminId: string,
    status: string,
    notes?: string
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Validate status transition
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'dispatched',
      'in_transit',
      'delivered',
      'delivery_failed',
      'completed',
      'cancelled',
      'refunded',
    ];

    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
    }

    // Cancelling and refunding move stock, reservations and money. A bare status
    // write here would skip all of that (and make the order look cancelled while
    // its stock stays taken and its items stay actionable), so they only go
    // through their dedicated endpoints.
    if (status === 'cancelled') {
      throw new AppError('Use the cancel endpoint to cancel an order', 400, 'USE_CANCEL_ENDPOINT');
    }
    if (status === 'refunded') {
      throw new AppError('Use the refund endpoint to refund an order', 400, 'USE_REFUND_ENDPOINT');
    }

    if (!isValidOrderStatusTransition(order.orderStatus, status)) {
      throw new AppError(
        `Cannot move an order from "${order.orderStatus}" to "${status}"`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // An order whose money is being / has been refunded must not be completed: delivering it
    // would post earnings to the ledger for goods the customer already got their money back for.
    if (status === 'delivered' && ['refund_pending', 'refunded'].includes(order.paymentStatus)) {
      throw new AppError('This order has been refunded and cannot be marked delivered', 400, 'ORDER_REFUNDED');
    }

    // Update order status. Guarded on the status we validated against, so a
    // concurrent change can't be silently overwritten. Delivery carries the same
    // side effects as the seller/rider paths: delivery time, and COD is paid
    // at the door.
    const isDelivered = status === 'delivered';
    const isCodDelivery = isDelivered && isCashAtDoor(order);
    const applied = await prisma.order.updateMany({
      where: { id: orderId, orderStatus: order.orderStatus },
      data: {
        orderStatus: status,
        ...(isDelivered ? { deliveredAt: new Date() } : {}),
        ...(isCodDelivery ? { paymentStatus: 'paid', paymentCollectedBy: codCollectorOf(order), paidAt: new Date() } : {}),
      },
    });
    if (applied.count === 0) {
      throw new AppError('Order status changed while updating; please retry', 409, 'ORDER_STATUS_CONFLICT');
    }
    if (isDelivered) {
      await prisma.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'delivered' },
      });
    }
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (isDelivered) {
      // The rider's job closes with the order (otherwise it keeps taking one of their two
      // slots), and they are paid their fee and charged the cash as if they had delivered it.
      try {
        await prisma.$transaction(async (tx) => {
          const job = await tx.delivery.findFirst({
            where: { orderId, riderId: { not: null }, status: { notIn: ['cancelled', 'delivered', 'delivery_failed'] } },
          });
          if (!job || !job.riderId) return;
          const closed = await tx.delivery.updateMany({
            where: { id: job.id, status: job.status },
            data: { status: 'delivered', deliveryTime: new Date() },
          });
          if (closed.count === 0) return;
          await tx.rider.update({ where: { id: job.riderId }, data: { totalDeliveries: { increment: 1 } } });
          await postDeliveryEntries(tx, {
            riderId: job.riderId,
            deliveryId: job.id,
            orderId,
            orderNumber: updatedOrder.orderNumber,
            fee: Number(job.riderFee ?? 0),
            bonus: Number(job.riderBonus ?? 0),
            cashCollected: isCodDelivery && codCollectorOf(order) === 'rider' ? Number(updatedOrder.totalAmount) : 0,
          });
        });
      } catch (jobErr) {
        logger.error({ err: jobErr, orderId }, 'Failed to close the rider job');
      }
      try {
        await ledgerService.recordOrderCompletion(orderId);
      } catch (ledgerErr) {
        logger.error({ err: ledgerErr, orderId }, 'Failed to record ledger entries');
      }
    }

    // Add status history
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status,
        notes: notes || `Status updated by admin`,
        changedBy: adminId,
      },
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(orderId, status, adminId);
    if (status === 'ready') {
      await riderService.ensureDeliveryForOrder(orderId);
    }

    return updatedOrder;
  }

  /**
   * Cancel order (admin)
   */
  async cancelOrder(orderId: string, adminId: string | null, reason: string, opts: { by?: 'admin' | 'system' } = {}) {
    const by = opts.by ?? 'admin';
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if order can be cancelled — a failed delivery is included since
    // the alternative to cancelling+refunding it is retryDelivery below.
    const cancellableStatuses = ['pending', 'confirmed', 'preparing', 'delivery_failed'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      throw new AppError(
        `Order cannot be cancelled. Current status: ${order.orderStatus}`,
        400,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    // Cancel order and restore stock
    let refundIssued = null as IssuedRefund | null;
    let cancelledDelivery = null as CancelledDelivery | null;
    const cancelledOrder = await prisma.$transaction(async (tx) => {
      // Claim the cancellation: only one of any concurrent cancel/accept/ready
      // transitions can move the order out of a cancellable status. Without this
      // a stale read let a cancel revive-or-double-restock an order.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, orderStatus: { in: cancellableStatuses } },
        data: {
          orderStatus: 'cancelled',
          cancellationReason: reason,
          cancelledBy: by,
        },
      });
      if (claimed.count === 0) {
        throw new AppError('Order can no longer be cancelled', 409, 'ORDER_NOT_CANCELLABLE');
      }
      cancelledDelivery = await cancelOpenDelivery(tx, orderId, reason);
      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      // Items already cancelled (e.g. by their seller) were restocked when that
      // happened; only restock what is still live. Read before the cascade below.
      const liveItems = await tx.orderItem.findMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
      });

      // Cascade cancellation to all order items so the seller UI doesn't
      // show stale "Pending/Confirmed/Preparing" rows with action buttons
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'cancelled' },
      });

      // Restore stock — a variant item drew from its own stock pool at order
      // time (see order.service.ts createOrder), so it must be restored there,
      // not on the shared product-level stock it never touched.
      for (const item of liveItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
              totalOrders: { decrement: 1 },
            },
          });
        }
      }


      // A cancelled order shouldn't keep consuming the promo's quota.
      await releasePromotionUsage(tx, orderId);

      // Hub units this order took go back into the batches they came from.
      await releaseHubAllocations(tx, orderId, { reason: `Order ${order.orderNumber} cancelled by ${by}`, performedBy: adminId ?? 'System' });

      // If the customer had already paid, the money is owed back: refund it now
      // (wallet) or queue it for the admin to send (everything else).
      refundIssued = await issueRefund(tx, orderId, {
        reason: `Order cancelled by ${by}: ${reason}`,
        createdBy: adminId,
      });

      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'cancelled',
          notes: by === 'system' ? `Cancelled automatically. ${reason}` : `Cancelled by admin. Reason: ${reason}`,
          changedBy: adminId,
        },
      });

      return updatedOrder;
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(cancelledOrder.id, 'cancelled', adminId ?? 'system');
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

  /**
   * Retry a failed delivery (admin) — sends the order back out for dispatch
   * instead of cancelling/refunding it. Resets the existing Delivery row
   * (Delivery.orderId is unique, so we reopen it rather than creating a new
   * one) back to unclaimed so any rider can pick it up again.
   */
  async retryDelivery(orderId: string, adminId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    if (order.orderStatus !== 'delivery_failed') {
      throw new AppError(
        `Only a failed delivery can be retried. Current status: ${order.orderStatus}`,
        400,
        'ORDER_NOT_RETRYABLE'
      );
    }

    // The rider being unassigned must stop receiving this order's events.
    const previousRider = await prisma.delivery.findUnique({
      where: { orderId },
      select: { rider: { select: { userId: true } } },
    });

    const reopened = await prisma.$transaction(async (tx) => {
      const previous = await tx.delivery.findUnique({ where: { orderId }, select: { id: true, riderId: true } });
      await tx.delivery.updateMany({
        where: { orderId },
        data: { ...reopenDeliveryData(previous?.riderId), deliveryNotes: null },
      });
      await tx.order.update({ where: { id: orderId }, data: { orderStatus: 'ready' } });
      await tx.orderItem.updateMany({
        where: { orderId, status: { not: 'cancelled' } },
        data: { status: 'ready' },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'ready',
          notes: 'Delivery retry initiated by admin — back in the rider queue',
          changedBy: adminId,
        },
      });
      return previous;
    });

    if (previousRider?.rider?.userId) socketManager.removeUserFromOrder(previousRider.rider.userId, orderId);
    await realtimeOrderService.emitOrderStatusUpdate(orderId, 'ready', adminId);
    // Offer it to a rider now rather than on the next sweep (never the one it failed with).
    if (reopened?.id) postDeliverySoon(reopened.id, orderId);
    return { orderId, status: 'ready' };
  }

  /**
   * Process refund (admin)
   *
   * Behaviour by payment method:
   *   - wallet: credits the user's wallet inside the same transaction → instant `refunded`
   *   - everything else (safepay / jazzcash / easypaisa / bank / cod):
   *     marks the order as `refund_pending` and emits an admin alert.
   *     The actual money movement must be triggered manually via the
   *     gateway dashboard until the refund API is wired up. Marking it as
   *     `refunded` here without moving cash would lie to customers.
   */
  async processRefund(orderId: string, adminId: string, refundAmount?: number, reason?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    if (order.paymentStatus !== 'paid') {
      throw new AppError('Order is not paid, cannot process refund', 400, 'ORDER_NOT_PAID');
    }

    // On an order that is still in flight a refund would leave it live (and later deliverable)
    // with its stock and promo still taken. Cancelling does all of that and refunds in one step.
    if (['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'].includes(order.orderStatus)) {
      throw new AppError('Cancel this order to refund it', 400, 'USE_CANCEL_ENDPOINT');
    }

    const refund = refundAmount ?? Number(order.totalAmount);
    const orderTotal = Number(order.totalAmount);
    if (refund <= 0 || refund > orderTotal) {
      throw new AppError(
        `Refund amount must be between 0 and ${orderTotal}`,
        400,
        'INVALID_REFUND_AMOUNT',
      );
    }

    const isWallet = order.paymentMethod === 'wallet';

    // issueRefund locks the order row, caps the amount at what is still
    // unrefunded and (for wallet orders) credits the wallet atomically, so a
    // double click or two admins can't refund twice. Partial refunds are tracked
    // cumulatively instead of marking the whole order refunded.
    const issued = await prisma.$transaction(async (tx) => {
      const r = await issueRefund(tx, orderId, {
        amount: refund,
        reason: reason?.trim() ? `Refund processed by admin: ${reason.trim()}` : 'Refund processed by admin',
        createdBy: adminId,
      });
      if (!r) {
        throw new AppError('Order is not paid, cannot process refund', 400, 'ORDER_NOT_PAID');
      }
      if (isWallet && r.fullyRefunded) {
        await tx.order.update({ where: { id: orderId }, data: { orderStatus: 'refunded' } });
      }
      return r;
    });
    const result = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    await realtimeOrderService.emitOrderStatusUpdate(
      orderId,
      isWallet && issued.fullyRefunded ? 'refunded' : result.orderStatus,
      adminId,
    );

    if (!isWallet) {
      logger.warn({ orderId, paymentMethod: order.paymentMethod }, 'Refund marked refund_pending in the database; process the actual refund in the gateway dashboard');
    }

    return {
      orderId: result.id,
      refundId: issued.refundId,
      refundAmount: issued.amount,
      status: result.orderStatus,
      paymentStatus: result.paymentStatus,
      requiresManualGatewayAction: !isWallet,
    };
  }

  /**
   * Get platform analytics
   */
  async getPlatformAnalytics(filters: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      totalRevenue,
      totalUsers,
      totalSellers,
      activeUsers,
      activeSellers,
      totalCommission,
      ordersByStatus,
      revenueByDay,
      ordersToday,
      revenueToday,
      ordersThisWeek,
      revenueThisWeek,
      ordersThisMonth,
      revenueThisMonth,
      allTimeOrders,
      allTimeRevenue,
    ] = await Promise.all([
      // Total orders (in period)
      prisma.order.count({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
      }),

      // Total revenue (GMV)
      prisma.order.aggregate({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
          paymentStatus: 'paid',
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Total users (all customers)
      prisma.user.count({ where: { userType: 'customer' } }),
      // Total sellers (all sellers)
      prisma.seller.count(),

      // Active users (users who placed orders in period)
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        select: {
          customerId: true,
        },
        distinct: ['customerId'],
      }),

      // Active sellers (sellers with orders)
      prisma.orderItem.findMany({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        select: {
          sellerId: true,
        },
        distinct: ['sellerId'],
      }),

      // Total commission earned
      prisma.orderItem.aggregate({
        where: {
          order: {
            createdAt: {
              gte: dateFrom,
              lte: dateTo,
            },
            paymentStatus: 'paid',
          },
        },
        _sum: {
          commissionAmount: true,
        },
      }),

      // Orders by status
      prisma.order.groupBy({
        by: ['orderStatus'],
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        _count: {
          id: true,
        },
      }),

      // Revenue by day (last 30 days)
      prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_amount) as revenue
        FROM orders
        WHERE created_at >= ${dateFrom}
          AND created_at <= ${dateTo}
          AND payment_status = 'paid'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,

      // Orders today
      prisma.order.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Revenue today (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // Orders this week
      prisma.order.count({
        where: { createdAt: { gte: weekStart } },
      }),
      // Revenue this week (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: weekStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // Orders this month
      prisma.order.count({
        where: { createdAt: { gte: monthStart } },
      }),
      // Revenue this month (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // All-time order count, independent of the dateFrom/dateTo window
      prisma.order.count(),
      // All-time revenue (paid only), independent of the dateFrom/dateTo window
      prisma.order.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenueNum = Number(totalRevenue._sum.totalAmount || 0);
    return {
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      overview: {
        periodOrders: totalOrders,
        totalOrders: allTimeOrders,
        totalRevenue: Number(allTimeRevenue._sum.totalAmount || 0),
        periodRevenue: totalRevenueNum,
        totalUsers,
        totalSellers,
        activeUsers: activeUsers.filter((u) => u.customerId).length,
        activeSellers: activeSellers.length,
        totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      },
      revenue: {
        today: Number(revenueToday._sum.totalAmount || 0),
        thisWeek: Number(revenueThisWeek._sum.totalAmount || 0),
        thisMonth: Number(revenueThisMonth._sum.totalAmount || 0),
        total: totalRevenueNum,
      },
      orders: {
        today: ordersToday,
        thisWeek: ordersThisWeek,
        thisMonth: ordersThisMonth,
        total: totalOrders,
      },
      ordersByStatus: ordersByStatus.reduce(
        (acc, item) => {
          acc[item.orderStatus] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      ),
      // COUNT/SUM come back from raw SQL as BigInt/Decimal, which JSON cannot carry.
      revenueByDay: (revenueByDay as Array<{ date: Date; orders: bigint | number; revenue: unknown }>).map((row) => ({
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
        orders: Number(row.orders),
        revenue: Number(row.revenue ?? 0),
      })),
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics() {
    const [
      todayOrders,
      todayRevenue,
      pendingOrders,
      inTransitOrders,
      cancelledOrders,
      averageOrderValue,
    ] = await Promise.all([
      // Today's orders
      prisma.order.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // Today's revenue
      prisma.order.aggregate({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          paymentStatus: 'paid',
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          orderStatus: 'pending',
        },
      }),

      // In transit orders
      prisma.order.count({
        where: {
          orderStatus: 'in_transit',
        },
      }),

      // Cancelled orders (last 7 days)
      prisma.order.count({
        where: {
          orderStatus: 'cancelled',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Average order value
      prisma.order.aggregate({
        where: {
          paymentStatus: 'paid',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _avg: {
          totalAmount: true,
        },
      }),
    ]);

    return {
      today: {
        orders: todayOrders,
        revenue: Number(todayRevenue._sum.totalAmount || 0),
      },
      pendingOrders,
      inTransitOrders,
      cancelledOrdersLast7Days: cancelledOrders,
      averageOrderValue: Number(averageOrderValue._avg.totalAmount || 0),
    };
  }
}

export default new AdminOrderService();

