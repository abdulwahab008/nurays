import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { isStoredFile, isPrivateRef, storedFileOwner } from '../storage';
import { SELLER_DIRECT_METHODS } from '../utils/paymentCustody';
import ledgerService from './ledger.service';
import { notify } from './notify.service';
import { logger } from '../utils/logger';

/** The kitchen a customer pays directly by transfer (the first item's seller). */
async function payeeSellerUserId(orderId: string): Promise<string | null> {
  const item = await prisma.orderItem.findFirst({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { seller: { select: { userId: true } } },
  });
  return item?.seller.userId ?? null;
}

/** Payment by bank transfer: the customer submits the transfer, the kitchen (or an admin) confirms it. */
export class OrderPayments {
  /**
   * Get seller account details for manual online payment (Bank, JazzCash, EasyPaisa)
   */
  async getSellerPaymentDetails(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: {
          take: 1,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                bankName: true,
                bankAccountName: true,
                bankAccountNumber: true,
                jazzcashNumber: true,
                jazzcashAccountTitle: true,
                easypaisaNumber: true,
                easypaisaAccountTitle: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    const seller = order.items[0]?.seller;

    // Only accounts the seller has actually configured. The customer sends real
    // money to whatever is listed here, so there are no placeholder fallbacks —
    // a seller with nothing configured yields an empty list.
    const accounts: Array<{ provider: string; accountTitle?: string; accountNumber: string }> = [];
    if (seller?.jazzcashNumber) {
      accounts.push({
        provider: 'JazzCash',
        accountTitle: seller.jazzcashAccountTitle || seller.businessName,
        accountNumber: seller.jazzcashNumber,
      });
    }
    if (seller?.easypaisaNumber) {
      accounts.push({
        provider: 'EasyPaisa',
        accountTitle: seller.easypaisaAccountTitle || seller.businessName,
        accountNumber: seller.easypaisaNumber,
      });
    }
    if (seller?.bankAccountNumber) {
      accounts.push({
        provider: seller.bankName || 'Bank Transfer',
        accountTitle: seller.bankAccountName || seller.businessName,
        accountNumber: seller.bankAccountNumber,
      });
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentSubmittedAt: order.paymentSubmittedAt,
      paymentReferenceNumber: order.paymentReferenceNumber,
      sellerId: seller?.id ?? null,
      sellerName: seller?.businessName ?? null,
      accounts,
    };
  }

  /**
   * Buyer submits manual payment details (TID / reference / proof)
   */
  async submitManualPayment(
    orderId: string,
    userId: string,
    data: {
      referenceNumber: string;
      senderName?: string;
      senderAccount?: string;
      proofUrl?: string;
      notes?: string;
    }
  ) {
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

    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already marked as paid', 400, 'ALREADY_PAID');
    }

    // Manual proof only makes sense for an online-transfer order that is still
    // awaiting payment — not a cancelled/refunded order, and not COD or wallet.
    if (['cancelled', 'refunded'].includes(order.orderStatus)) {
      throw new AppError('This order is no longer payable', 400, 'ORDER_NOT_PAYABLE');
    }
    if (['cod', 'wallet'].includes(order.paymentMethod)) {
      throw new AppError('This order is not paid by manual transfer', 400, 'NOT_MANUAL_PAYMENT');
    }

    const referenceNumber = (data.referenceNumber ?? '').trim();
    if (!referenceNumber) {
      throw new AppError('A payment reference number is required', 400, 'REFERENCE_REQUIRED');
    }
    // A proof is a link to an uploaded file — never an inline data: payload.
    // And it must be a receipt this customer uploaded (stored privately).
    if (
      data.proofUrl &&
      (!isStoredFile(data.proofUrl, { private: 'proofs' }) ||
        (isPrivateRef(data.proofUrl) && storedFileOwner(data.proofUrl) !== userId))
    ) {
      throw new AppError('Invalid payment proof link', 400, 'INVALID_PROOF_URL');
    }

    // Atomic: only an order still awaiting (or re-submitting/contesting) payment
    // can move to payment_submitted; never overwrite refund_pending/refunded/paid.
    const submitted = await prisma.order.updateMany({
      where: {
        id: orderId,
        customerId: userId,
        paymentStatus: { in: ['pending', 'failed', 'disputed', 'payment_submitted'] },
      },
      data: {
        paymentStatus: 'payment_submitted',
        paymentReferenceNumber: referenceNumber,
        paymentSenderName: data.senderName,
        paymentSenderAccount: data.senderAccount,
        paymentProofUrl: data.proofUrl,
        paymentNotes: data.notes,
        paymentSubmittedAt: new Date(),
      },
    });
    if (submitted.count === 0) {
      throw new AppError('Payment can no longer be submitted for this order', 409, 'PAYMENT_STATE_CONFLICT');
    }
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    // Add status history record
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: `Payment submitted by customer. Reference/TID: ${data.referenceNumber}`,
        changedBy: userId,
      },
    });

    // Notify via realtime
    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, userId);
    // The kitchen the money went to checks its account.
    const payee = await payeeSellerUserId(orderId);
    if (payee) {
      await notify({
        userId: payee,
        category: 'payments',
        type: 'payment',
        title: `Check a payment: order #${updated.orderNumber}`,
        message: `The customer says they sent Rs ${Number(updated.totalAmount).toLocaleString()} (reference ${data.referenceNumber}). Confirm it once it's in your account.`,
        actionUrl: `/sellers/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }

    return {
      success: true,
      orderId: updated.id,
      paymentStatus: updated.paymentStatus,
      paymentReferenceNumber: updated.paymentReferenceNumber,
      paymentSubmittedAt: updated.paymentSubmittedAt,
    };
  }

  /**
   * Seller confirms or disputes manual payment
   */
  async confirmManualPayment(
    orderId: string,
    sellerUserId: string,
    confirmed: boolean,
    disputeReason?: string
  ) {
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });

    if (!seller) {
      throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
    }

    // Only the seller the customer was told to pay (the same one
    // getSellerPaymentDetails shows) may confirm or dispute the transfer; other
    // sellers on a multi-seller order must not be able to mark it paid.
    const order = await prisma.order.findFirst({
      where: { id: orderId, items: { some: { sellerId: seller.id } } },
      include: { items: { take: 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { sellerId: true } } },
    });

    if (!order) {
      throw new AppError('Order not found for this seller', 404, 'ORDER_NOT_FOUND');
    }
    if (order.items[0]?.sellerId !== seller.id) {
      throw new AppError('Only the seller receiving this payment can confirm it', 403, 'NOT_PAYEE');
    }
    if (['cancelled', 'refunded'].includes(order.orderStatus) || !SELLER_DIRECT_METHODS.includes(order.paymentMethod)) {
      throw new AppError('This order has no manual payment to confirm', 400, 'NOT_MANUAL_PAYMENT');
    }

    const newPaymentStatus = confirmed ? 'paid' : 'disputed';

    // Atomic, and only from payment_submitted: a seller can't mark an order paid
    // that the customer never paid for (which would unlock a payout for money
    // the platform never received), nor flip a refunded order back to paid.
    const applied = await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'payment_submitted' },
      data: {
        paymentStatus: newPaymentStatus,
        // The transfer went into the seller's own account.
        paymentCollectedBy: confirmed ? 'seller' : undefined,
        paymentConfirmedBy: confirmed ? 'seller' : undefined,
        paymentConfirmedAt: confirmed ? new Date() : undefined,
        paidAt: confirmed ? new Date() : undefined,
        paymentDisputeReason: !confirmed ? disputeReason || 'Payment verification failed' : null,
      },
    });
    if (applied.count === 0) {
      throw new AppError(
        'There is no submitted payment awaiting confirmation on this order',
        409,
        'NO_PAYMENT_SUBMITTED'
      );
    }
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: confirmed
          ? 'Payment verified and marked as PAID by seller'
          : `Payment disputed by seller: ${disputeReason || 'Payment not received'}`,
        changedBy: sellerUserId,
      },
    });

    // A transfer confirmed after the order was already delivered posts its ledger
    // entries now (they're only posted once the money is actually in).
    if (confirmed && ['delivered', 'completed'].includes(updated.orderStatus)) {
      await ledgerService.recordOrderCompletion(orderId).catch((err) =>
        logger.error({ err, orderId }, 'Ledger posting failed')
      );
    }

    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, sellerUserId);
    if (updated.customerId) {
      await notify(
        confirmed
          ? {
              userId: updated.customerId,
              category: 'payments',
              type: 'payment',
              title: 'Payment confirmed',
              message: `The kitchen confirmed your payment for order #${updated.orderNumber}.`,
              actionUrl: `/orders/${orderId}`,
              data: { orderId },
              channels: ['push'],
            }
          : {
              userId: updated.customerId,
              category: 'payments',
              type: 'payment',
              title: "The kitchen couldn't find your payment",
              message: `For order #${updated.orderNumber}: "${disputeReason || 'Payment not received'}". Check the transfer and send the receipt again, or contact support.`,
              actionUrl: `/orders/${orderId}`,
              data: { orderId },
              channels: ['push', 'email', 'sms'],
            }
      );
    }

    return {
      success: true,
      orderId: updated.id,
      paymentStatus: updated.paymentStatus,
      confirmed,
    };
  }

  /**
   * An admin settles a transfer the kitchen disputed (or hasn't confirmed yet) after checking
   * the receipt with both sides: the money is in the kitchen's account after all. The order
   * is then paid, with the money held by the kitchen.
   */
  async adminConfirmManualPayment(orderId: string, adminId: string, note?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderStatus: true, paymentMethod: true } });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (['cancelled', 'refunded'].includes(order.orderStatus) || !SELLER_DIRECT_METHODS.includes(order.paymentMethod)) {
      throw new AppError('This order has no transfer to confirm', 400, 'NOT_MANUAL_PAYMENT');
    }
    const now = new Date();
    // Only from a reported transfer: never over a refund or an already settled payment.
    const applied = await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ['payment_submitted', 'disputed'] } },
      data: {
        paymentStatus: 'paid',
        paymentCollectedBy: 'seller',
        paymentConfirmedBy: 'admin',
        paymentConfirmedAt: now,
        paidAt: now,
        paymentDisputeReason: null,
      },
    });
    if (applied.count === 0) {
      throw new AppError('Only a transfer the customer reported (and the kitchen confirmed or disputed) can be confirmed', 409, 'NO_PAYMENT_SUBMITTED');
    }
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: order.orderStatus,
        notes: `Payment confirmed by Nuray support${note?.trim() ? `: ${note.trim()}` : ''}`,
        changedBy: adminId,
      },
    });
    if (['delivered', 'completed'].includes(order.orderStatus)) {
      await ledgerService.recordOrderCompletion(orderId).catch((err) => logger.error({ err, orderId }, 'Ledger posting failed'));
    }
    await realtimeOrderService.emitOrderStatusUpdate(orderId, order.orderStatus, adminId);
    const settled = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, customerId: true } });
    if (settled?.customerId) {
      await notify({
        userId: settled.customerId,
        category: 'payments',
        type: 'payment',
        title: 'Payment confirmed',
        message: `Nuray support confirmed your payment for order #${settled.orderNumber}.`,
        actionUrl: `/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }
    const payee = await payeeSellerUserId(orderId);
    if (payee && settled) {
      await notify({
        userId: payee,
        category: 'payments',
        type: 'payment',
        title: `Payment confirmed: order #${settled.orderNumber}`,
        message: `Nuray support checked the transfer for order #${settled.orderNumber}: it reached your account, so the order is paid.`,
        actionUrl: `/sellers/orders/${orderId}`,
        data: { orderId },
        channels: ['push', 'email'],
      });
    }
    return { orderId, paymentStatus: 'paid' };
  }
}

export default new OrderPayments();
