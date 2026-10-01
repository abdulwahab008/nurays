import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

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

  // 'paid' = money held and nothing (or only part) refunded so far.
  if (order.paymentStatus !== 'paid') return null;

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
      reason: opts.reason,
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
 * Refund what a seller's cancelled items were worth. Their share of the order is
 * their part of the subtotal applied to everything but delivery (discount and
 * GST are baked in proportionally; the delivery fee isn't split per seller, so
 * it comes back only when the whole order is cancelled). When the order is now
 * fully cancelled this refunds everything still unrefunded, delivery included.
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
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const subtotal = Number(order.subtotal);
  if (subtotal <= 0 || cancelledItemIds.length === 0) return null;
  const items = await tx.orderItem.findMany({ where: { id: { in: cancelledItemIds } } });
  const itemsTotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  const goodsPortion = Number(order.totalAmount) - Number(order.deliveryFee);
  return issueRefund(tx, orderId, {
    amount: money((itemsTotal / subtotal) * goodsPortion),
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

/** The admin's queue of refunds still waiting for the money to be sent. */
export async function listRefunds(filters: { status?: string; page?: number; limit?: number }) {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);
  const where = filters.status ? { status: filters.status } : {};
  const [rows, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        order: { select: { orderNumber: true, paymentMethod: true, totalAmount: true, customerId: true } },
      },
    }),
    prisma.refund.count({ where }),
  ]);
  return {
    refunds: rows.map((r) => ({ ...r, amount: Number(r.amount), order: { ...r.order, totalAmount: Number(r.order.totalAmount) } })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
