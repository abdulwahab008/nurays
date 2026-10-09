import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getGateway } from '../gateways';
import { PAYABLE_STATUSES } from '../utils/paymentCustody';
import { debitWallet, getWallet, listWalletTransactions } from './wallet.service';
import { onlinePaymentsAvailable, startOrderCheckout } from './online-payment.service';

export { PAYABLE_STATUSES };

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export class PaymentService {
  /**
   * Payment methods and whether each can be used right now.
   */
  async getPaymentMethods() {
    return [
      {
        id: 'cod',
        name: 'Cash on Delivery',
        kind: 'cash',
        isAvailable: true,
        description: 'Pay cash when the order arrives (or when you collect it)',
      },
      {
        id: 'safepay',
        name: 'Card or mobile wallet (online)',
        kind: 'online',
        isAvailable: onlinePaymentsAvailable(),
        description: 'Pay online by card, JazzCash or EasyPaisa through a secure hosted checkout',
      },
      {
        id: 'wallet',
        name: 'Nuray Wallet',
        kind: 'wallet',
        isAvailable: true,
        description: 'Pay from your wallet balance',
      },
      {
        id: 'jazzcash',
        name: 'JazzCash transfer to the kitchen',
        kind: 'manual_transfer',
        isAvailable: true,
        description: "Send the amount to the kitchen's own JazzCash account, then upload the receipt",
      },
      {
        id: 'easypaisa',
        name: 'EasyPaisa transfer to the kitchen',
        kind: 'manual_transfer',
        isAvailable: true,
        description: "Send the amount to the kitchen's own EasyPaisa account, then upload the receipt",
      },
      {
        id: 'bank',
        name: 'Bank transfer to the kitchen',
        kind: 'manual_transfer',
        isAvailable: true,
        description: "Transfer to the kitchen's own bank account (IBFT / Raast), then upload the receipt",
      },
    ];
  }

  /**
   * Pay for an existing order: from the wallet, or by starting an online checkout (the
   * customer is sent to `redirectUrl`). COD needs nothing now; transfers to the kitchen are
   * done from the order page.
   */
  async processPayment(orderId: string, userId: string, paymentMethod: string, _paymentDetails?: unknown) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.customerId !== userId) throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    if (order.paymentStatus === 'paid') throw new AppError('Order already paid', 400, 'PAYMENT_ALREADY_PAID');
    // A refund in progress (or done) means the money is already on its way back.
    if (['refund_pending', 'refunded'].includes(order.paymentStatus)) {
      throw new AppError('This order has been refunded', 400, 'ORDER_REFUNDED');
    }
    if (['cancelled', 'refunded'].includes(order.orderStatus)) {
      throw new AppError('Cannot pay for cancelled order', 400, 'ORDER_CANCELLED');
    }
    const validMethods = ['jazzcash', 'easypaisa', 'bank', 'card', 'cod', 'wallet', 'safepay'];
    if (!validMethods.includes(paymentMethod)) {
      throw new AppError('Invalid payment method', 400, 'INVALID_PAYMENT_METHOD');
    }

    if (paymentMethod === 'wallet') {
      return this.processWalletPayment(orderId, userId);
    }

    if (paymentMethod === 'cod') {
      // Only an order nobody has paid for yet: a transfer the customer reported (awaiting the
      // kitchen's confirmation, or disputed) must not be quietly turned into cash on delivery.
      const claimed = await prisma.order.updateMany({
        where: { id: orderId, customerId: userId, paymentStatus: { in: ['pending', 'failed'] } },
        data: { paymentMethod: 'cod', paymentStatus: 'pending' },
      });
      if (claimed.count === 0) {
        throw new AppError('A reported transfer is awaiting confirmation; contact the kitchen or support to change the payment method', 409, 'PAYMENT_STATE_CONFLICT');
      }
      return { paymentId: `COD-${orderId}`, status: 'pending', message: 'Payment will be collected on delivery', redirectUrl: null, expiresAt: null };
    }

    if (paymentMethod === 'safepay' || paymentMethod === 'card') {
      const checkout = await startOrderCheckout(orderId, userId);
      return {
        paymentId: checkout.tracker,
        token: checkout.tracker,
        status: 'pending',
        redirectUrl: checkout.redirectUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        gateway: 'safepay',
      };
    }

    // JazzCash / EasyPaisa / bank are transfers into the kitchen's own account, done from the
    // order page (payment details + receipt upload), unless a bank payment aggregator is
    // configured. Never a fake payment page.
    const bankAggregator = getGateway('bank');
    if (paymentMethod !== 'bank' || !bankAggregator?.isConfigured()) {
      throw new AppError(
        "Pay this order by transfer to the kitchen's account from the order page, then upload the receipt.",
        400,
        'MANUAL_TRANSFER_METHOD'
      );
    }
    const result = await bankAggregator.createPayment({
      orderId,
      orderNumber: order.orderNumber,
      amountPkr: Math.round(Number(order.totalAmount)),
      returnUrl: `${FRONTEND_URL}/payment/return?order=${orderId}`,
      cancelUrl: `${FRONTEND_URL}/payment/return?order=${orderId}&result=cancelled`,
      description: `Order ${order.orderNumber}`,
    });
    if (!result.success) {
      throw new AppError(result.message || 'Payment initiation failed', 400, result.errorCode || 'GATEWAY_ERROR');
    }
    await prisma.order.update({ where: { id: orderId }, data: { paymentMethod: 'bank', paymentTransactionId: result.paymentId } });
    return {
      paymentId: result.paymentId,
      token: result.paymentId,
      status: 'pending',
      redirectUrl: result.redirectUrl ?? undefined,
      expiresAt: result.expiresAt?.toISOString() ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      gateway: 'bank',
    };
  }

  /**
   * Pay an existing order from the wallet. The order is claimed first (only one concurrent
   * request can), then the wallet is debited with a conditional update, all in one
   * transaction: no double debit, no order marked paid without the money.
   */
  private async processWalletPayment(orderId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          customerId: userId,
          paymentStatus: { in: ['pending', 'failed'] },
          orderStatus: { notIn: ['cancelled', 'refunded'] },
        },
        data: {
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          paymentCollectedBy: 'platform',
          paidAt: new Date(),
          paymentTransactionId: `WALLET-${orderId}`,
        },
      });
      if (claimed.count === 0) {
        throw new AppError('Order already paid or no longer payable', 400, 'PAYMENT_ALREADY_PAID');
      }
      await debitWallet(tx, {
        userId,
        amount: Number(order.totalAmount),
        orderId,
        description: `Payment for order ${order.orderNumber}`,
      });
      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      return {
        paymentId: `WALLET-${orderId}`,
        status: 'completed',
        orderStatus: updated.orderStatus,
        paymentStatus: updated.paymentStatus,
      };
    });
  }

  /**
   * Has this payment come through? Looks up the order by the checkout session (or payment id)
   * we issued for it. Read-only: online payments are settled only by Safepay's signed return or
   * a verified webhook, never by a client asking.
   */
  async verifyPayment(paymentId: string, userId: string, transactionId?: string) {
    const ids = [paymentId, transactionId].filter((v): v is string => !!v);
    let order = null;
    for (const id of ids) {
      const attempt = await prisma.paymentAttempt.findUnique({ where: { tracker: id }, select: { orderId: true } });
      order = attempt?.orderId
        ? await prisma.order.findUnique({ where: { id: attempt.orderId } })
        : await prisma.order.findFirst({ where: { paymentTransactionId: id, customerId: userId } });
      if (order) break;
    }
    if (!order) throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    if (order.customerId !== userId) throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    if (['refund_pending', 'refunded'].includes(order.paymentStatus)) {
      throw new AppError('This order has been refunded', 400, 'ORDER_REFUNDED');
    }
    if (order.paymentStatus !== 'paid') {
      throw new AppError('The payment has not been confirmed yet', 400, 'VERIFY_PENDING');
    }
    return {
      paymentStatus: 'completed',
      orderStatus: order.orderStatus,
      transactionId: order.paymentTransactionId,
      paidAt: order.paidAt,
    };
  }

  /** Wallet balance with the latest movements (the full history is paginated separately). */
  async getWalletBalance(userId: string) {
    const [wallet, recent] = await Promise.all([getWallet(userId), listWalletTransactions(userId, 1, 10)]);
    return { ...wallet, recentTransactions: recent.transactions };
  }
}

export default new PaymentService();
