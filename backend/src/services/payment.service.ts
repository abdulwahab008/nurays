import prisma from '../config/database';
import { issueRefund } from './refund.service';
import { AppError } from '../middleware/errorHandler';
import { getGateway, getConfiguredGateways } from '../gateways';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/** Payment states from which a gateway / transfer payment may still be accepted. */
export const PAYABLE_STATUSES = ['pending', 'failed', 'payment_submitted', 'disputed'];

export class PaymentService {
  /**
   * Get available payment methods (gateways enabled via env are marked available)
   */
  async getPaymentMethods() {
    const configured = getConfiguredGateways();
    const safepayReady = configured.includes('safepay');
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
        isAvailable: safepayReady,
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
   * Process payment for an order
   */
  async processPayment(
    orderId: string,
    userId: string,
    paymentMethod: string,
    _paymentDetails?: any
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: { id: true, email: true },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.customerId !== userId) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    if (order.paymentStatus === 'paid') {
      throw new AppError('Order already paid', 400, 'PAYMENT_ALREADY_PAID');
    }

    // A refund in progress (or done) means the money is already on its way back: the order
    // must not be paid for again.
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

    // Handle wallet payment
    if (paymentMethod === 'wallet') {
      return await this.processWalletPayment(orderId, userId, Number(order.totalAmount));
    }

    // Handle COD - no payment processing needed
    if (paymentMethod === 'cod') {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: 'cod',
          paymentStatus: 'pending', // Will be marked as paid on delivery
        },
      });

      return {
        paymentId: `COD-${orderId}`,
        status: 'pending',
        message: 'Payment will be collected on delivery',
        redirectUrl: null,
        expiresAt: null,
      };
    }

    // Online: card / wallet payments go through Safepay's hosted checkout (the customer
    // picks card, JazzCash or EasyPaisa there). The order is recorded as 'safepay' so it is
    // never mistaken for a transfer into the kitchen's own account.
    const safepayMethods = ['jazzcash', 'easypaisa', 'card', 'safepay'];
    const safepay = getGateway('safepay');
    const bankAggregator = getGateway('bank');
    const gatewayMethod =
      safepayMethods.includes(paymentMethod) && safepay?.isConfigured()
        ? 'safepay'
        : paymentMethod === 'bank' && bankAggregator?.isConfigured()
          ? 'bank'
          : null;
    const gateway = gatewayMethod ? getGateway(gatewayMethod) : null;

    if (!gateway || !gatewayMethod) {
      // Never hand out a fake payment page. Without an online gateway, JazzCash /
      // EasyPaisa / bank are transfers into the kitchen's own account, done from the
      // order page (payment details + receipt upload).
      if (['jazzcash', 'easypaisa', 'bank'].includes(paymentMethod)) {
        throw new AppError(
          "Pay this order by transfer to the kitchen's account from the order page, then upload the receipt.",
          400,
          'MANUAL_TRANSFER_METHOD'
        );
      }
      throw new AppError('Online payment is not available right now', 503, 'GATEWAY_UNAVAILABLE');
    }

    {
      const returnUrl = `${FRONTEND_URL}/payment/return?order_id=${orderId}`;
      const cancelUrl = `${FRONTEND_URL}/checkout?cancel=1`;
      const amountPkr = Math.round(Number(order.totalAmount));

      const result = await gateway.createPayment({
        orderId,
        orderNumber: order.orderNumber,
        amountPkr,
        customerEmail: order.customer?.email ?? undefined,
        returnUrl,
        cancelUrl,
        description: `Order ${order.orderNumber}`,
      });

      if (!result.success) {
        throw new AppError(
          result.message || 'Payment initiation failed',
          400,
          result.errorCode || 'GATEWAY_ERROR'
        );
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: gatewayMethod,
          paymentTransactionId: result.paymentId,
        },
      });

      return {
        paymentId: result.paymentId,       // this is the Safepay tracker token (beacon)
        token: result.paymentId,           // alias so frontend can use it clearly
        status: 'pending',
        redirectUrl: result.redirectUrl ?? undefined,
        expiresAt: result.expiresAt?.toISOString() ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        gateway: gatewayMethod,
      };
    }
  }

  /**
   * Process wallet payment
   *
   * Concurrency safety: balance check and decrement happen in a single
   * conditional updateMany (WHERE balance >= amount). If two requests race,
   * only one row update will affect a row; the other gets count=0 and rolls
   * back with INSUFFICIENT_BALANCE.
   */
  private async processWalletPayment(orderId: string, userId: string, amount: number) {
    // Ensure wallet exists (outside transaction so we don't hold a lock for a missing-row path)
    const existing = await prisma.wallet.findUnique({ where: { userId } });
    if (!existing) {
      await prisma.wallet.create({
        data: { userId, balance: 0, currency: 'PKR' },
      });
    }

    const paymentId = `WALLET-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      // Claim the order first. The "already paid" check in processPayment ran
      // before this transaction, so two concurrent requests can both pass it;
      // only one of them can flip paymentStatus here, and the loser aborts
      // before touching the wallet (no double debit).
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          customerId: userId,
          // Only an order still awaiting payment: never one that is paid, or whose money is
          // being / has been refunded.
          paymentStatus: { in: ['pending', 'failed'] },
          orderStatus: { notIn: ['cancelled', 'refunded'] },
        },
        data: {
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          paymentCollectedBy: 'platform',
          paidAt: new Date(),
          paymentTransactionId: paymentId,
        },
      });
      if (claimed.count === 0) {
        throw new AppError('Order already paid or no longer payable', 400, 'PAYMENT_ALREADY_PAID');
      }

      // Read the wallet inside the transaction so balanceBefore is consistent
      // with the decrement we're about to apply.
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (wallet.isLocked) {
        throw new AppError('Wallet is locked', 400, 'WALLET_LOCKED');
      }

      const balanceBefore = Number(wallet.balance);

      // Atomic check-and-decrement: only updates if balance is still sufficient.
      // Two concurrent payments can't both succeed because the second one's
      // WHERE clause won't match after the first decrement commits.
      const { count } = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });

      if (count === 0) {
        throw new AppError('Insufficient wallet balance', 400, 'INSUFFICIENT_BALANCE');
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          orderId,
          transactionType: 'debit',
          amount,
          balanceBefore,
          balanceAfter: balanceBefore - amount,
          description: `Payment for order ${orderId}`,
          status: 'completed',
        },
      });

      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      return {
        paymentId,
        status: 'completed',
        orderStatus: updatedOrder.orderStatus,
        paymentStatus: updatedOrder.paymentStatus,
      };
    });

    return result;
  }

  /**
   * Verify payment (called from the post-payment return page).
   *
   * Hardened: we never mark an order paid based on the client-supplied
   * transactionId alone. The order must be located by a server-side lookup,
   * AND the gateway must confirm the payment AND the gateway-reported amount
   * must match the order total.
   */
  async verifyPayment(paymentId: string, userId: string, transactionId?: string) {
    // 1. Locate the order. Trust only the relation user→order, not the tx id.
    let order = null;
    if (transactionId) {
      order = await prisma.order.findFirst({
        where: { paymentTransactionId: transactionId, customerId: userId },
      });
    }
    if (!order) {
      // Fallbacks: try paymentId as a stored tx id, or extract orderId from PAY-* format
      order = await prisma.order.findFirst({
        where: { paymentTransactionId: paymentId, customerId: userId },
      });
    }
    if (!order) {
      // Anchored: the id must be exactly a PAY-* id, not merely contain one.
      const orderIdMatch = paymentId.match(/^PAY-\d+-([0-9a-f-]{36})$/i);
      if (orderIdMatch) {
        order = await prisma.order.findUnique({ where: { id: orderIdMatch[1] } });
      }
    }

    if (!order) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    if (order.customerId !== userId) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }
    if (['refund_pending', 'refunded'].includes(order.paymentStatus)) {
      throw new AppError('This order has been refunded', 400, 'ORDER_REFUNDED');
    }
    if (order.paymentStatus === 'paid') {
      return {
        paymentStatus: 'completed',
        orderStatus: order.orderStatus,
        transactionId: order.paymentTransactionId || paymentId,
        paidAt: order.paidAt,
      };
    }

    // 2. Re-verify with the appropriate gateway. Failing closed: if we can't
    // confirm with the gateway, we refuse to mark the order paid. Only the payment
    // id WE issued for this order when the payment was started is ever sent to a
    // gateway; a caller-supplied id would let them pick which gateway is asked.
    if (!order.paymentTransactionId) {
      throw new AppError(
        'No online payment was started for this order',
        400,
        'VERIFY_PENDING',
      );
    }
    const paymentTxId = order.paymentTransactionId;
    const legacyMatch = paymentTxId.match(/^(JC|EP|BANK)-/);
    let gatewayKey: 'jazzcash' | 'easypaisa' | 'bank' | 'safepay' | null = null;
    if (legacyMatch) {
      gatewayKey =
        legacyMatch[1] === 'JC' ? 'jazzcash' : legacyMatch[1] === 'EP' ? 'easypaisa' : 'bank';
    } else if (!paymentTxId.match(/^(PAY|WALLET|COD)-/)) {
      // Safepay tokens are tracker UUIDs / sec_* strings; treat anything not
      // matching the synthetic prefixes as a Safepay tracker.
      gatewayKey = 'safepay';
    }

    if (!gatewayKey) {
      // Synthetic / non-gateway tokens (PAY-*, COD-*) — cannot be verified
      // by a gateway. Refuse to mark paid; the webhook is the source of truth.
      throw new AppError(
        'Payment cannot be verified — awaiting gateway confirmation',
        400,
        'VERIFY_PENDING',
      );
    }

    const gateway = getGateway(gatewayKey);
    if (!gateway || !gateway.isConfigured()) {
      throw new AppError(
        'Payment gateway not available for verification',
        503,
        'GATEWAY_UNAVAILABLE',
      );
    }

    const verifyResult = await gateway.verifyPayment({
      paymentId: paymentTxId,
      transactionId: transactionId ?? undefined,
      orderId: order.id,
    });

    if (!verifyResult.success || verifyResult.status !== 'completed') {
      throw new AppError(
        verifyResult.message || 'Payment verification failed',
        400,
        verifyResult.errorCode || 'VERIFY_FAILED',
      );
    }

    // 3. Amount check. The gateway must report the amount it collected, and it must
    // cover the order total; a gateway that doesn't say how much was paid can't be
    // trusted to mark the order paid.
    if (verifyResult.amountPkr === undefined || verifyResult.amountPkr === null || Number.isNaN(Number(verifyResult.amountPkr))) {
      throw new AppError('The payment gateway did not confirm the amount paid', 502, 'VERIFY_NO_AMOUNT');
    }
    {
      const expected = Math.round(Number(order.totalAmount));
      if (Number(verifyResult.amountPkr) < expected) {
        console.error(
          `[verifyPayment] Amount mismatch on order ${order.id}: ` +
            `gateway=${verifyResult.amountPkr} expected=${expected}`,
        );
        throw new AppError(
          'Payment amount does not match the order total',
          400,
          'AMOUNT_MISMATCH',
        );
      }
    }

    // 4. Atomic update. The WHERE clause guards against a webhook flipping
    // the status under us between read and write.
    // A payment can land after the order was cancelled (the customer was already at the
    // gateway). The money is real, so it is recorded and immediately refunded; the order
    // must not be revived to 'confirmed'. The decision is made from the order's CURRENT
    // state under a row lock — the copy read above can be stale by now.
    const updateResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      const r = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: { in: PAYABLE_STATUSES } },
        data: {
          paymentStatus: 'paid',
          paymentCollectedBy: 'platform',
          paidAt: new Date(),
          paymentTransactionId: verifyResult.transactionId || paymentTxId,
          orderStatus: fresh.orderStatus === 'pending' ? 'confirmed' : fresh.orderStatus,
        },
      });
      if (r.count > 0 && ['cancelled', 'refunded'].includes(fresh.orderStatus)) {
        await issueRefund(tx, order.id, { reason: 'Payment received after the order was cancelled', createdBy: null });
      }
      return r;
    });

    // Either we updated it, or the webhook beat us — both are fine.
    if (updateResult.count > 0) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.orderStatus === 'pending' ? 'confirmed' : order.orderStatus,
          notes: 'Payment verified via gateway inquiry',
          changedBy: userId,
        },
      });
    }

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    return {
      paymentStatus: 'completed',
      orderStatus: finalOrder?.orderStatus,
      transactionId: finalOrder?.paymentTransactionId,
      paidAt: finalOrder?.paidAt,
    };
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(userId: string) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            transactionType: true,
            amount: true,
            balanceAfter: true,
            description: true,
            status: true,
            createdAt: true,
            orderId: true,
          },
        },
      },
    });

    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          currency: 'PKR',
        },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              transactionType: true,
              amount: true,
              balanceAfter: true,
              description: true,
              status: true,
              createdAt: true,
              orderId: true,
            },
          },
        },
      });
    }

    return {
      balance: Number(wallet.balance),
      currency: wallet.currency,
      isLocked: wallet.isLocked,
      recentTransactions: wallet.transactions.map((tx) => ({
        id: tx.id,
        type: tx.transactionType,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
        description: tx.description,
        status: tx.status,
        orderId: tx.orderId,
        createdAt: tx.createdAt,
      })),
    };
  }
}

export default new PaymentService();

