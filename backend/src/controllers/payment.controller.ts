import { Request, Response } from 'express';
import paymentService from '../services/payment.service';
import { AppError } from '../middleware/errorHandler';
import { verifySafepayWebhook } from '../gateways/safepay.gateway';
import prisma from '../config/database';

export const getPaymentMethods = async (_req: Request, res: Response) => {
  const methods = await paymentService.getPaymentMethods();

  res.status(200).json({
    success: true,
    data: methods,
  });
};

export const processPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { orderId, paymentMethod, paymentDetails } = req.body;
  const result = await paymentService.processPayment(
    orderId,
    req.user.userId,
    paymentMethod,
    paymentDetails
  );

  res.status(200).json({
    success: true,
    data: result,
    message: 'Payment processed successfully',
  });
};

export const verifyPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { paymentId, transactionId } = req.body;
  const result = await paymentService.verifyPayment(paymentId, req.user.userId, transactionId);

  res.status(200).json({
    success: true,
    data: result,
    message: 'Payment verified successfully',
  });
};

export const getWalletBalance = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const wallet = await paymentService.getWalletBalance(req.user.userId);

  res.status(200).json({
    success: true,
    data: wallet,
  });
};

/**
 * Safepay webhook — called by Safepay server when payment status changes.
 * Public route (no auth middleware), validated via HMAC signature on the raw body.
 *
 * Hardened against:
 *   - signature spoofing (HMAC verify on rawBody)
 *   - replay / duplicate delivery (idempotent — skip if already paid)
 *   - amount mismatch (refuses to mark paid if gateway amount < order total)
 */
export const safepayWebhook = async (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.headers['x-sfpy-hmac-sha256'] as string | undefined;

  if (!rawBody || !verifySafepayWebhook(rawBody, signature)) {
    console.warn('[Safepay Webhook] Invalid signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = req.body as {
    data?: { tracker?: { state?: string; token?: string; amount?: number }; order_id?: string };
    metadata?: { order_id?: string };
  };
  const state = body?.data?.tracker?.state ?? '';
  const token = body?.data?.tracker?.token ?? '';
  const orderId = body?.metadata?.order_id ?? body?.data?.order_id ?? '';
  const gatewayAmount = Number(body?.data?.tracker?.amount ?? 0);

  console.log(`[Safepay Webhook] state=${state} orderId=${orderId} token=${token} amount=${gatewayAmount}`);

  if (state !== 'TRACKER_PAID' || !orderId) {
    // Nothing to do — still 200 so Safepay doesn't retry.
    return res.status(200).json({ received: true });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, paymentStatus: true, totalAmount: true, paymentTransactionId: true },
    });

    if (!order) {
      console.warn(`[Safepay Webhook] Unknown orderId=${orderId} — ignoring`);
      return res.status(200).json({ received: true });
    }

    // Idempotency — already processed
    if (order.paymentStatus === 'paid') {
      console.log(`[Safepay Webhook] Order ${orderId} already paid — skipping`);
      return res.status(200).json({ received: true, alreadyPaid: true });
    }

    // Amount verification — gateway must have collected >= order total (PKR, no decimals)
    const expectedAmount = Math.round(Number(order.totalAmount));
    if (gatewayAmount < expectedAmount) {
      console.error(
        `[Safepay Webhook] Amount mismatch on order ${orderId}: gateway=${gatewayAmount} expected=${expectedAmount}`,
      );
      // Don't mark paid. Still 200 so Safepay stops retrying; we'll review out-of-band.
      return res.status(200).json({ received: true, amountMismatch: true });
    }

    await prisma.order.update({
      where: { id: orderId, paymentStatus: { not: 'paid' } },
      data: {
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentTransactionId: token,
      },
    });
    console.log(`[Safepay Webhook] Order ${orderId} marked as paid`);
  } catch (err) {
    console.error('[Safepay Webhook] DB update failed', err);
    // Return 500 so Safepay retries on transient DB errors.
    return res.status(500).json({ error: 'Internal error' });
  }

  return res.status(200).json({ received: true });
};


export const initiateWalletTopUp = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const amount = Number(req.body?.amount);
  const result = await paymentService.initiateTopUp(req.user.userId, amount);
  res.status(200).json({ success: true, data: result });
};

export const confirmWalletTopUp = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const paymentId = req.body?.paymentId;
  if (!paymentId || typeof paymentId !== 'string') {
    throw new AppError('paymentId is required', 400, 'PAYMENT_ID_REQUIRED');
  }
  const result = await paymentService.confirmTopUp(req.user.userId, paymentId);
  res.status(200).json({ success: true, data: result });
};
