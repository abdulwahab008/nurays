import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createSafepayCheckout, safepayGateway } from '../gateways/safepay.gateway';
import { issueRefund } from './refund.service';
import { creditWallet } from './wallet.service';
import realtimeOrderService from './realtime-order.service';
import notificationService from './notification.service';
import { PAYABLE_STATUSES } from '../utils/paymentCustody';
import { logger } from '../utils/logger';
import { reportError } from '../config/sentry';

/**
 * Online payments through Safepay's hosted checkout, for orders and wallet top-ups.
 *
 * Every checkout session (Safepay "tracker") is recorded in payment_attempts with what it pays
 * for and its amount, which Safepay fixes when the session starts. A session is settled
 * exactly once, by whichever confirmation arrives first: the customer's signed return from
 * Safepay or a verified webhook. Since the session's amount and purpose come from our own
 * record, a confirmation can never be applied to a different order or amount.
 */

const money = (n: number) => Math.round(n * 100) / 100;
const apiUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const webUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
const returnUrl = () => `${apiUrl()}/api/${process.env.API_VERSION || 'v1'}/payments/safepay/return`;

export const TOPUP_MIN = 100;
export const TOPUP_MAX = Number(process.env.WALLET_TOPUP_MAX) || 50_000;
/** A session nobody completed within this long is closed (a late confirmation still settles). */
const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;

export function onlinePaymentsAvailable(): boolean {
  return safepayGateway.isConfigured();
}

function requireGateway() {
  if (!onlinePaymentsAvailable()) throw new AppError('Online payment is not available right now', 503, 'GATEWAY_UNAVAILABLE');
}

/** Start paying an order online. The order must have been placed for online payment. */
export async function startOrderCheckout(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.customerId !== userId) throw new AppError('Access denied', 403, 'ACCESS_DENIED');
  if (order.paymentStatus === 'paid') throw new AppError('Order already paid', 400, 'PAYMENT_ALREADY_PAID');
  if (['refund_pending', 'refunded'].includes(order.paymentStatus)) throw new AppError('This order has been refunded', 400, 'ORDER_REFUNDED');
  if (['cancelled', 'refunded'].includes(order.orderStatus)) throw new AppError('Cannot pay for cancelled order', 400, 'ORDER_CANCELLED');
  requireGateway();
  if (!['safepay', 'card'].includes(order.paymentMethod)) {
    throw new AppError('This order was not placed for online payment', 400, 'NOT_AN_ONLINE_ORDER');
  }

  const amount = money(Number(order.totalAmount));
  const checkout = await createSafepayCheckout({
    amount,
    reference: order.id,
    returnUrl: returnUrl(),
    cancelUrl: `${webUrl()}/payment/return?order=${encodeURIComponent(order.id)}&result=cancelled`,
  }).catch((err: Error) => {
    logger.error({ err, orderId }, 'Safepay checkout could not be started');
    throw new AppError('Online payment could not be started. Please try again in a moment.', 502, 'GATEWAY_ERROR');
  });

  await prisma.$transaction([
    prisma.paymentAttempt.create({
      data: { purpose: 'order', orderId: order.id, userId, tracker: checkout.tracker, amount },
    }),
    prisma.order.update({ where: { id: order.id }, data: { paymentMethod: 'safepay', paymentTransactionId: checkout.tracker } }),
  ]);
  return { redirectUrl: checkout.redirectUrl, tracker: checkout.tracker, amount };
}

/** Start a wallet top-up of `amount` rupees. */
export async function startWalletTopup(userId: string, amountInput: number) {
  const amount = money(Number(amountInput));
  if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
    throw new AppError(`Top up between Rs ${TOPUP_MIN} and Rs ${TOPUP_MAX.toLocaleString()}.`, 400, 'INVALID_TOPUP_AMOUNT');
  }
  requireGateway();
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet?.isLocked) throw new AppError('Your wallet is locked. Please contact support.', 400, 'WALLET_LOCKED');

  const attemptId = randomUUID();
  const checkout = await createSafepayCheckout({
    amount,
    reference: attemptId,
    returnUrl: returnUrl(),
    cancelUrl: `${webUrl()}/wallet?topup=cancelled`,
  }).catch((err: Error) => {
    logger.error({ err, userId }, 'Safepay top-up could not be started');
    throw new AppError('Online payment could not be started. Please try again in a moment.', 502, 'GATEWAY_ERROR');
  });
  await prisma.paymentAttempt.create({
    data: { id: attemptId, purpose: 'wallet_topup', userId, tracker: checkout.tracker, amount },
  });
  return { redirectUrl: checkout.redirectUrl, tracker: checkout.tracker, amount };
}

export type SettleOutcome = 'paid' | 'already_settled' | 'duplicate' | 'unknown';

export interface SettleResult {
  outcome: SettleOutcome;
  purpose?: 'order' | 'wallet_topup';
  orderId?: string | null;
}

/**
 * Apply a confirmed payment for a checkout session, once. Safe to call again for the same
 * session (later calls change nothing).
 *  - order still awaiting payment: marked paid. If it was cancelled meanwhile, the money is
 *    refunded (queued for the admin, like other online refunds). An amount above the order's
 *    current total (items cancelled while the customer paid) is credited to the wallet.
 *  - order already paid another way: this second payment is credited to the wallet.
 *  - wallet top-up: the wallet is credited.
 */
export async function settleAttempt(tracker: string, via: 'return' | 'webhook', reference?: string | null): Promise<SettleResult> {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM payment_attempts WHERE tracker = ${tracker} FOR UPDATE`;
    if (locked.length === 0) return { outcome: 'unknown' as const };
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: locked[0].id } });
    const purpose = attempt.purpose as 'order' | 'wallet_topup';
    if (['paid', 'duplicate'].includes(attempt.status)) return { outcome: 'already_settled' as const, purpose, orderId: attempt.orderId };

    const amount = Number(attempt.amount);
    const settled = { settledVia: via, reference: reference?.slice(0, 200) || null, paidAt: new Date() };

    if (purpose === 'wallet_topup') {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'paid', ...settled } });
      await creditWallet(tx, {
        userId: attempt.userId,
        amount,
        type: 'topup',
        description: 'Wallet top-up (online payment)',
        referenceId: tracker,
      });
      return { outcome: 'paid' as const, purpose };
    }

    if (!attempt.orderId) {
      // The order was deleted; the money is still the customer's.
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'duplicate', ...settled } });
      await creditWallet(tx, { userId: attempt.userId, amount, type: 'credit', description: 'Online payment for an order that no longer exists', referenceId: tracker });
      return { outcome: 'duplicate' as const, purpose };
    }

    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${attempt.orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: attempt.orderId } });
    const total = money(Number(order.totalAmount));

    if (!PAYABLE_STATUSES.includes(order.paymentStatus) || amount < total) {
      // Paid already (or being refunded), or somehow short of the total: the order is left as
      // it is and this money goes to the customer's wallet rather than being lost.
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'duplicate', ...settled } });
      await creditWallet(tx, {
        userId: attempt.userId,
        amount,
        type: 'credit',
        orderId: order.id,
        description: `Online payment for order ${order.orderNumber} that wasn't needed, credited to your wallet`,
        referenceId: tracker,
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.orderStatus,
          notes: `An extra online payment of Rs ${amount} (Safepay ${tracker}) was credited to the customer's wallet`,
          changedBy: null,
        },
      });
      return { outcome: 'duplicate' as const, purpose, orderId: order.id };
    }

    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'paid', ...settled } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'paid',
        paymentMethod: 'safepay',
        paymentCollectedBy: 'platform',
        paidAt: new Date(),
        paymentTransactionId: tracker,
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.orderStatus,
        notes: `Paid online: Rs ${amount} through Safepay${reference ? ` (ref ${reference.slice(0, 60)})` : ''}`,
        changedBy: null,
      },
    });
    if (amount > total) {
      await creditWallet(tx, {
        userId: attempt.userId,
        amount: money(amount - total),
        type: 'credit',
        orderId: order.id,
        description: `Order ${order.orderNumber} costs less than you paid (items were cancelled): the difference is in your wallet`,
        referenceId: tracker,
      });
    }
    if (['cancelled', 'refunded'].includes(order.orderStatus)) {
      await issueRefund(tx, order.id, { reason: 'Payment received after the order was cancelled', createdBy: null });
    }
    return { outcome: 'paid' as const, purpose, orderId: order.id };
  });

  // After commit: tell the order's parties (never fails the settlement).
  if (result.purpose === 'order' && result.orderId && result.outcome !== 'already_settled') {
    try {
      const order = await prisma.order.findUnique({
        where: { id: result.orderId },
        select: { orderStatus: true, orderNumber: true, customerId: true, items: { select: { seller: { select: { userId: true } } } } },
      });
      if (order) {
        await realtimeOrderService.emitOrderStatusUpdate(result.orderId, order.orderStatus, 'payment');
        if (result.outcome === 'paid') {
          for (const sellerUserId of new Set(order.items.map((i) => i.seller.userId).filter(Boolean))) {
            await notificationService.createNotification(sellerUserId, {
              type: 'order',
              title: 'Payment received',
              message: `Order #${order.orderNumber} has been paid online.`,
              actionUrl: `/sellers/orders/${result.orderId}`,
              data: { orderId: result.orderId },
            });
          }
        } else if (order.customerId) {
          await notificationService.createNotification(order.customerId, {
            type: 'payment',
            title: 'Payment credited to your wallet',
            message: `An online payment for order #${order.orderNumber} wasn't needed, so it is in your Nuray Wallet.`,
            actionUrl: '/wallet',
            data: { orderId: result.orderId },
          });
        }
      }
    } catch (err) {
      logger.error({ err, orderId: result.orderId }, 'Payment notifications failed');
    }
  }
  if (result.outcome === 'unknown') {
    logger.warn({ tracker, via }, 'Payment confirmation for an unknown checkout session');
    reportError(new Error('Safepay confirmation for an unknown tracker'), { tracker, via });
  }
  return result;
}

/** Where to send the customer after Safepay returns them. */
export function landingUrlFor(result: SettleResult, ok: boolean): string {
  if (result.purpose === 'wallet_topup') return `${webUrl()}/wallet?topup=${ok ? 'paid' : 'failed'}`;
  if (result.purpose === 'order' && result.orderId) {
    if (!ok) return `${webUrl()}/payment/return?order=${encodeURIComponent(result.orderId)}&result=failed`;
    return `${webUrl()}/orders/${encodeURIComponent(result.orderId)}?payment=${result.outcome === 'duplicate' ? 'duplicate' : 'paid'}`;
  }
  return `${webUrl()}/payment/return?result=${ok ? 'unknown' : 'failed'}`;
}

/** The session a tracker belongs to (to send someone back to the right page). */
export async function attemptByTracker(tracker: string) {
  return prisma.paymentAttempt.findUnique({ where: { tracker }, select: { purpose: true, orderId: true } });
}

/**
 * The checkout session a webhook is about, when it reports a successful payment. Payload
 * formats differ between Safepay's API versions, so both shapes are read; anything that isn't
 * clearly a success is ignored.
 */
export function successfulTrackerFromWebhook(body: any): string | null {
  const type = String(body?.type ?? body?.event ?? '').toLowerCase();
  const data = body?.data ?? {};
  const tracker = typeof data.tracker === 'string' ? data.tracker : data?.tracker?.token ?? data?.token ?? null;
  const state = String(data?.tracker?.state ?? data?.state ?? '').toUpperCase();
  const successType = /^payment[.:](created|succeeded|success|paid|completed)$/.test(type);
  const successState = state === 'TRACKER_PAID';
  return tracker && (successType || successState) ? String(tracker) : null;
}

/** Close sessions nobody completed; returns how many were closed. */
export async function expireAbandonedAttempts(now = new Date()): Promise<number> {
  const { count } = await prisma.paymentAttempt.updateMany({
    where: { status: 'pending', createdAt: { lt: new Date(now.getTime() - ATTEMPT_TTL_MS) } },
    data: { status: 'expired' },
  });
  return count;
}

/** Where an order's online payment stands, for the customer's pages. */
export async function orderPaymentStatus(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, paymentStatus: true, paymentMethod: true, paidAt: true, orderStatus: true },
  });
  if (!order || order.customerId !== userId) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  const latest = await prisma.paymentAttempt.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true, amount: true },
  });
  return {
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    orderStatus: order.orderStatus,
    paidAt: order.paidAt,
    canPayOnline: onlinePaymentsAvailable() && ['safepay', 'card'].includes(order.paymentMethod) && PAYABLE_STATUSES.includes(order.paymentStatus) && !['cancelled', 'refunded'].includes(order.orderStatus),
    lastAttempt: latest ? { status: latest.status, createdAt: latest.createdAt, amount: Number(latest.amount) } : null,
  };
}
