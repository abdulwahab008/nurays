import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { notify } from './notify.service';
import { AppError } from '../middleware/errorHandler';
import { parseBreakdown } from '../utils/deliveryEarnings';
import { GST_RATE, priceOrder } from '../utils/pricing';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface IssuedRefund {
  refundId: string;
  amount: number;
  method: 'wallet' | 'manual';
  status: 'pending' | 'completed';
  /** True when this refund brought the order to fully refunded. */
  fullyRefunded: boolean;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Create the refund owed on a paid order, inside the caller's transaction.
 *
 *  - wallet-paid  -> credited to the customer's wallet right now (Refund 'completed')
 *  - anything else (gateway / bank transfer) -> a 'pending' Refund for the admin to
 *    send; it stays in their queue until completeRefund marks it done
 *
 * The order row is locked first and the amount is capped at what is still
 * unrefunded, so concurrent cancels / refund clicks can never refund more than
 * the customer paid. Returns null when the order isn't paid or nothing is left
 * to refund (e.g. a cancelled-but-never-paid COD order).
 *
 * `amount` omitted = refund everything not yet refunded.
 */
export async function issueRefund(
  tx: Tx,
  orderId: string,
  opts: { amount?: number; reason: string; createdBy: string | null }
): Promise<IssuedRefund | null> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

  // 'paid' = money held and nothing (or only part) refunded so far. A customer who has
  // SENT a manual transfer but whose payment the seller hasn't confirmed yet
  // ('payment_submitted') may already have lost their money, so cancelling must queue a
  // refund for the admin to check against the receiving account (and dismiss if nothing
  // actually arrived) rather than quietly creating nothing.
  const unconfirmedTransfer = order.paymentStatus === 'payment_submitted';
  if (order.paymentStatus !== 'paid' && !unconfirmedTransfer) return null;

  const total = Number(order.totalAmount);
  const agg = await tx.refund.aggregate({
    where: { orderId, status: { not: 'failed' } },
    _sum: { amount: true },
  });
  const alreadyRefunded = Number(agg._sum.amount ?? 0);
  const remaining = money(total - alreadyRefunded);
  const amount = money(Math.min(opts.amount ?? remaining, remaining));
  if (amount <= 0) return null;

  const isWallet = order.paymentMethod === 'wallet';
  const fullyRefunded = money(alreadyRefunded + amount) >= total;

  if (isWallet) {
    if (!order.customerId) {
      throw new AppError('Cannot refund wallet — order has no customer', 400, 'NO_CUSTOMER');
    }
    // A wallet-paid order has a wallet; create one only defensively so a missing
    // row can never block a refund the customer is owed.
    const wallet = await tx.wallet.upsert({
      where: { userId: order.customerId },
      create: { userId: order.customerId, balance: 0, currency: 'PKR' },
      update: {},
    });
    const credited = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
    });
    const balanceAfter = Number(credited.balance);
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        orderId,
        transactionType: 'credit',
        amount,
        balanceBefore: money(balanceAfter - amount),
        balanceAfter,
        description: `Refund for order ${order.orderNumber}`,
        status: 'completed',
      },
    });
  }

  const refund = await tx.refund.create({
    data: {
      orderId,
      customerId: order.customerId,
      amount,
      method: isWallet ? 'wallet' : 'manual',
      status: isWallet ? 'completed' : 'pending',
      reason: unconfirmedTransfer ? `UNCONFIRMED TRANSFER — verify receipt first. ${opts.reason}` : opts.reason,
      createdBy: opts.createdBy,
      processedBy: isWallet ? opts.createdBy : null,
      processedAt: isWallet ? new Date() : null,
    },
  });

  if (fullyRefunded) {
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: isWallet ? 'refunded' : 'refund_pending' },
    });
  }

  await tx.orderStatusHistory.create({
    data: {
      orderId,
      status: order.orderStatus,
      notes: isWallet
        ? `Refund of ${amount} credited to the customer's wallet (${opts.reason})`
        : unconfirmedTransfer
          ? `Customer reported sending ${amount} by ${order.paymentMethod} but it was never confirmed. Verify receipt, then send it back or dismiss this refund (${opts.reason})`
          : `Refund of ${amount} is owed to the customer — awaiting manual ${order.paymentMethod} transfer (${opts.reason})`,
      changedBy: opts.createdBy,
    },
  });

  return {
    refundId: refund.id,
    amount,
    method: isWallet ? 'wallet' : 'manual',
    status: isWallet ? 'completed' : 'pending',
    fullyRefunded,
  };
}

/**
 * What the customer paid for one item: its price less its share of the manual-code
 * discount, plus GST on that. Orders from before per-item discount shares existed fall
 * back to a proportional split of the goods portion of the total.
 */
function itemNetPaid(
  item: { totalPrice: unknown; promoDiscount: unknown },
  order: { subtotal: unknown; totalAmount: unknown; deliveryFee: unknown },
  hasShares: boolean
): number {
  if (hasShares) {
    return (Number(item.totalPrice) - Number(item.promoDiscount)) * (1 + GST_RATE);
  }
  const subtotal = Number(order.subtotal);
  return subtotal > 0 ? (Number(item.totalPrice) / subtotal) * (Number(order.totalAmount) - Number(order.deliveryFee)) : 0;
}

/**
 * An UNPAID order that loses some items (a seller rejected theirs) must shrink: the customer
 * would otherwise be asked to pay — and the gateway amount check would demand — the full
 * original total for goods they will never receive, with nothing to refund later.
 * Re-prices from the items still live: subtotal, discount shares, that sellers' delivery
 * fees, GST and total.
 */
async function shrinkUnpaidOrder(tx: Tx, order: any) {
  const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
  const live = items.filter((i: any) => i.status !== 'cancelled');
  if (live.length === 0) return;
  const hasShares = items.some((i: any) => Number(i.promoDiscount) > 0);

  const subtotal = money(live.reduce((sum: number, i: any) => sum + Number(i.totalPrice), 0));
  const oldSubtotal = Number(order.subtotal);
  const discount = hasShares
    ? money(live.reduce((sum: number, i: any) => sum + Number(i.promoDiscount), 0))
    : money(oldSubtotal > 0 ? Number(order.discountAmount) * (subtotal / oldSubtotal) : 0);

  const liveSellers = new Set(live.map((i: any) => i.sellerId));
  const breakdown = parseBreakdown(order.deliveryFeeBreakdown);
  const liveBreakdown = breakdown.filter((r) => liveSellers.has(r.sellerId));
  // Legacy orders have no per-seller split, so their delivery fee stays as it was.
  // The customer's delivery fee is only the shares they pay; a kitchen-paid fee is not on their bill.
  const deliveryFee = breakdown.length
    ? money(liveBreakdown.filter((r) => r.paidBy !== 'seller').reduce((sum, r) => sum + r.fee, 0))
    : Number(order.deliveryFee);
  const sellerDeliveryCharge = breakdown.length
    ? money(liveBreakdown.filter((r) => r.paidBy === 'seller').reduce((sum, r) => sum + r.fee, 0))
    : Number(order.sellerDeliveryCharge ?? 0);

  const { taxAmount, totalAmount } = priceOrder(subtotal - discount, deliveryFee);
  await tx.order.update({
    where: { id: order.id },
    data: {
      subtotal,
      discountAmount: discount,
      deliveryFee,
      sellerDeliveryCharge,
      deliveryFeeBreakdown: breakdown.length ? (liveBreakdown as any) : undefined,
      taxAmount,
      totalAmount,
    },
  });
}

/**
 * Refund what a seller's cancelled items were worth: the customer's net payment for those
 * items, plus that seller's delivery fee once none of their items are left to deliver. When
 * the order is now fully cancelled this refunds everything still unrefunded, delivery
 * included. On an order that hasn't been paid there is nothing to refund, so it is re-priced
 * instead (see shrinkUnpaidOrder).
 */
export async function refundForCancelledItems(
  tx: Tx,
  orderId: string,
  cancelledItemIds: string[],
  opts: { reason: string; createdBy: string | null; orderFullyCancelled: boolean }
): Promise<IssuedRefund | null> {
  if (opts.orderFullyCancelled) {
    return issueRefund(tx, orderId, { reason: opts.reason, createdBy: opts.createdBy });
  }
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');

  if (['pending', 'failed', 'disputed'].includes(order.paymentStatus)) {
    await shrinkUnpaidOrder(tx, order);
    return null;
  }

  if (Number(order.subtotal) <= 0 || cancelledItemIds.length === 0) return null;
  const allItems = await tx.orderItem.findMany({ where: { orderId } });
  const hasShares = allItems.some((i: any) => Number(i.promoDiscount) > 0);
  const cancelled = allItems.filter((i: any) => cancelledItemIds.includes(i.id));
  const itemsPaid = cancelled.reduce((sum: number, i: any) => sum + itemNetPaid(i, order, hasShares), 0);

  // A seller with no live items left will not be delivering anything, so the
  // delivery fee the customer paid them comes back too. (Needs the per-seller
  // snapshot; orders from before it existed only get the goods refunded.)
  let deliveryBack = 0;
  for (const sellerId of new Set(cancelled.map((i: any) => i.sellerId))) {
    const live = allItems.filter((i: any) => i.sellerId === sellerId && i.status !== 'cancelled').length;
    if (live === 0) {
      deliveryBack += parseBreakdown(order.deliveryFeeBreakdown)
        .filter((r) => r.sellerId === sellerId && r.paidBy !== 'seller')
        .reduce((sum, r) => sum + r.fee, 0);
    }
  }

  return issueRefund(tx, orderId, {
    amount: money(itemsPaid + deliveryBack),
    reason: opts.reason,
    createdBy: opts.createdBy,
  });
}

/**
 * Admin confirms that a pending manual refund has actually been sent (bank /
 * JazzCash / gateway). Once every refund on a fully-refunded order is
 * completed, the order's paymentStatus becomes 'refunded'.
 */
export async function completeRefund(refundId: string, adminId: string, reference?: string) {
  const refund = await completeRefundRecord(refundId, adminId, reference);
  // After the commit: tell the customer the money is on its way.
  const order = await prisma.order.findUnique({ where: { id: refund.orderId }, select: { orderNumber: true, customerId: true } });
  if (order?.customerId) {
    await notify({
      userId: order.customerId,
      category: 'payments',
      type: 'payment',
      title: 'Refund sent',
      message: `We sent your refund of Rs ${Number(refund.amount).toLocaleString()} for order #${order.orderNumber}${refund.reference ? ` (reference ${refund.reference})` : ''}.`,
      actionUrl: `/orders/${refund.orderId}`,
      data: { orderId: refund.orderId, refundId },
      channels: ['push', 'email'],
      dedupeKey: `refund:${refundId}:sent`,
    });
  }
  return refund;
}

async function completeRefundRecord(refundId: string, adminId: string, reference?: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.refund.updateMany({
      where: { id: refundId, status: 'pending' },
      data: {
        status: 'completed',
        reference: reference?.trim() || null,
        processedBy: adminId,
        processedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const exists = await tx.refund.findUnique({ where: { id: refundId }, select: { status: true } });
      if (!exists) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
      throw new AppError('This refund is not pending', 409, 'REFUND_NOT_PENDING');
    }
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });

    const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });
    if (order.paymentStatus === 'refund_pending') {
      const stillPending = await tx.refund.count({ where: { orderId: order.id, status: 'pending' } });
      if (stillPending === 0) {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'refunded' } });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.orderStatus,
        notes: `Refund of ${Number(refund.amount)} sent to the customer${reference ? ` (ref ${reference})` : ''}`,
        changedBy: adminId,
      },
    });
    return refund;
  });
}

/**
 * Admin decides a pending refund isn't owed after all — typically an unconfirmed manual
 * transfer whose money never arrived. The refund is closed as 'failed' (it no longer counts
 * toward what has been refunded) and, if nothing else was refunded, the order's payment is
 * recorded as failed rather than left pending a refund that will never be sent.
 */
export async function dismissRefund(refundId: string, adminId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.refund.updateMany({
      where: { id: refundId, status: 'pending' },
      data: { status: 'failed', reference: reason.trim(), processedBy: adminId, processedAt: new Date() },
    });
    if (claimed.count === 0) {
      const exists = await tx.refund.findUnique({ where: { id: refundId }, select: { status: true } });
      if (!exists) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
      throw new AppError('This refund is not pending', 409, 'REFUND_NOT_PENDING');
    }
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${refund.orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });

    if (order.paymentStatus === 'refund_pending') {
      const active = await tx.refund.aggregate({
        where: { orderId: order.id, status: { not: 'failed' } },
        _count: { _all: true },
      });
      // No other refund stands. An order whose money was confirmed goes back to paid (it is
      // still the kitchen's earning); only a transfer that never arrived is marked failed.
      if (active._count._all === 0) {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: order.paidAt || order.paymentConfirmedAt ? 'paid' : 'failed' } });
      }
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.orderStatus,
        notes: `Refund of ${Number(refund.amount)} dismissed by admin: ${reason.trim()}`,
        changedBy: adminId,
      },
    });
    return refund;
  });
}

/** The admin's queue of refunds still waiting for the money to be sent. */
export async function listRefunds(filters: { status?: string; page?: number; limit?: number }) {
  const { page, limit } = pageArgs(filters.page, filters.limit);
  const where = filters.status ? { status: filters.status } : {};
  const [rows, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        order: {
          select: {
            orderNumber: true,
            paymentMethod: true,
            totalAmount: true,
            customerId: true,
            // Where the money came from, so a manual refund can go back the same way.
            paymentSenderAccount: true,
            paymentReferenceNumber: true,
            customer: { select: { phone: true, email: true, profile: { select: { fullName: true } } } },
          },
        },
      },
    }),
    prisma.refund.count({ where }),
  ]);
  return {
    refunds: rows.map((r) => {
      const { customer, ...order } = r.order;
      return {
        ...r,
        amount: Number(r.amount),
        order: { ...order, totalAmount: Number(order.totalAmount) },
        customer: customer ? { name: customer.profile?.fullName ?? null, phone: customer.phone, email: customer.email } : null,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
