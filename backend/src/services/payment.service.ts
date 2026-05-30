import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getGateway, getConfiguredGateways } from '../gateways';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export class PaymentService {
  /**
   * Get available payment methods (gateways enabled via env are marked available)
   */
  async getPaymentMethods() {
    const configured = getConfiguredGateways();
    const safepayReady = configured.includes('safepay');
    return [
      {
        id: 'jazzcash',
        name: 'JazzCash',
        icon: 'https://example.com/icons/jazzcash.png',
        isAvailable: safepayReady,
        description: 'Pay via JazzCash mobile wallet',
      },
      {
        id: 'easypaisa',
        name: 'EasyPaisa',
        icon: 'https://example.com/icons/easypaisa.png',
        isAvailable: safepayReady,
        description: 'Pay via EasyPaisa mobile wallet',
      },
      {
        id: 'bank',
        name: 'Bank Transfer / IBFT',
        icon: 'https://example.com/icons/bank.png',
        isAvailable: configured.includes('bank'),
        description: 'Pay via bank account (IBFT / 1LINK)',
      },
      {
        id: 'card',
        name: 'Credit/Debit Card',
        icon: 'https://example.com/icons/card.png',
        isAvailable: safepayReady,
        description: 'Pay via credit or debit card',
      },
      {
        id: 'cod',
        name: 'Cash on Delivery',
        icon: 'https://example.com/icons/cod.png',
        isAvailable: true,
        description: 'Pay cash when order is delivered',
        extraFee: 50,
      },
      {
        id: 'wallet',
        name: 'Nuray Wallet',
        icon: 'https://example.com/icons/wallet.png',
        isAvailable: true,
        description: 'Pay from your wallet balance',
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

    if (order.orderStatus === 'cancelled') {
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

    // Gateway: route jazzcash / easypaisa / card / safepay all through Safepay if it's configured
    // because Safepay is an aggregator that handles all these methods on one hosted page.
    const safepayMethods = ['jazzcash', 'easypaisa', 'card', 'safepay'];
    const gatewayMethod = safepayMethods.includes(paymentMethod) ? 'safepay' : paymentMethod;
    const gateway = getGateway(gatewayMethod);

    if (gateway?.isConfigured()) {
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
          paymentMethod: paymentMethod,
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

    // Fallback: no gateway configured - return placeholder URL (dev only)
    const paymentId = `PAY-${Date.now()}-${orderId.substring(0, 8)}`;
    const redirectUrl = this.generatePaymentUrl(paymentMethod, orderId, paymentId);

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: paymentMethod },
    });

    return {
      paymentId,
      status: 'pending',
      redirectUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      gateway: paymentMethod,
    };
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

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: 'wallet',
          paymentStatus: 'paid',
          paidAt: new Date(),
          paymentTransactionId: paymentId,
        },
      });

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
      const orderIdMatch = paymentId.match(/PAY-\d+-(.+)/);
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
    if (order.paymentStatus === 'paid') {
      return {
        paymentStatus: 'completed',
        orderStatus: order.orderStatus,
        transactionId: order.paymentTransactionId || paymentId,
        paidAt: order.paidAt,
      };
    }

    // 2. Re-verify with the appropriate gateway. Failing closed: if we can't
    // confirm with the gateway, we refuse to mark the order paid.
    const paymentTxId = order.paymentTransactionId || paymentId;
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

    // 3. Amount check. Gateway must have collected at least the order total.
    if (verifyResult.amountPkr !== undefined) {
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
    const updateResult = await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: { not: 'paid' } },
      data: {
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentTransactionId: verifyResult.transactionId || paymentTxId,
        orderStatus: order.orderStatus === 'pending' ? 'confirmed' : order.orderStatus,
      },
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

  /**
   * Generate payment URL (mock implementation)
   */
  private generatePaymentUrl(paymentMethod: string, orderId: string, paymentId: string): string {
    const baseUrl = process.env.PAYMENT_GATEWAY_URL || 'https://payment-gateway.example.com';
    return `${baseUrl}/pay/${paymentMethod}?order=${orderId}&payment=${paymentId}`;
  }
}

export default new PaymentService();

