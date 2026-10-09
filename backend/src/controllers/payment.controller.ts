import { Request, Response } from 'express';
import { reportError } from '../config/sentry';
import paymentService from '../services/payment.service';
import { AppError } from '../middleware/errorHandler';
import { verifySafepayReturn, verifySafepayWebhook } from '../gateways/safepay.gateway';
import {
  settleAttempt,
  landingUrlFor,
  attemptByTracker,
  successfulTrackerFromWebhook,
  startWalletTopup,
  orderPaymentStatus,
  onlinePaymentsAvailable,
  TOPUP_MIN,
  TOPUP_MAX,
} from '../services/online-payment.service';
import { listWalletTransactions } from '../services/wallet.service';
import { logger } from '../utils/logger';

const userIdOf = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
};

export const getPaymentMethods = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await paymentService.getPaymentMethods() });
};

export const processPayment = async (req: Request, res: Response) => {
  const { orderId, paymentMethod } = req.body;
  const result = await paymentService.processPayment(orderId, userIdOf(req), paymentMethod);
  res.status(200).json({ success: true, data: result, message: 'Payment processed successfully' });
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { paymentId, transactionId } = req.body;
  const result = await paymentService.verifyPayment(paymentId, userIdOf(req), transactionId);
  res.status(200).json({ success: true, data: result, message: 'Payment verified successfully' });
};

export const getOrderPaymentStatus = async (req: Request, res: Response) => {
  const data = await orderPaymentStatus(String(req.params.orderId), userIdOf(req));
  res.status(200).json({ success: true, data });
};

export const getWalletBalance = async (req: Request, res: Response) => {
  const wallet = await paymentService.getWalletBalance(userIdOf(req));
  res.status(200).json({
    success: true,
    data: { ...wallet, topUp: { available: onlinePaymentsAvailable(), min: TOPUP_MIN, max: TOPUP_MAX } },
  });
};

export const getWalletTransactions = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  res.status(200).json({ success: true, data: await listWalletTransactions(userIdOf(req), page, limit) });
};

export const topUpWallet = async (req: Request, res: Response) => {
  const result = await startWalletTopup(userIdOf(req), Number(req.body?.amount));
  res.status(200).json({ success: true, data: result });
};

/**
 * Where Safepay sends the customer after paying: a form POST of { tracker, sig, reference,
 * order_id } (also accepted as a query string). Public: it is authenticated by the signature
 * (HMAC-SHA256 of the tracker with our secret key). The payment is settled here and the
 * customer is redirected to the right page of the web app.
 */
export const safepayReturn = async (req: Request, res: Response) => {
  const src = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  const tracker = typeof src.tracker === 'string' ? src.tracker : undefined;
  const sig = typeof src.sig === 'string' ? src.sig : undefined;
  const reference = typeof src.reference === 'string' ? src.reference : typeof src.ref === 'string' ? src.ref : null;

  if (!tracker || !verifySafepayReturn(tracker, sig)) {
    logger.warn({ tracker }, 'Safepay return with a missing or invalid signature');
    const attempt = tracker ? await attemptByTracker(tracker) : null;
    return res.redirect(
      303,
      landingUrlFor({ outcome: 'unknown', purpose: attempt?.purpose as 'order' | 'wallet_topup' | undefined, orderId: attempt?.orderId }, false)
    );
  }
  try {
    const result = await settleAttempt(tracker, 'return', reference);
    return res.redirect(303, landingUrlFor(result, result.outcome !== 'unknown'));
  } catch (err) {
    // The customer is mid-redirect from Safepay: a page that says "we could not confirm your
    // payment yet" beats a JSON error on the API domain. The webhook or the sweep settles it.
    logger.error({ err, tracker }, 'Safepay return could not be settled');
    reportError(err as Error, { path: req.path, method: req.method, tracker });
    const attempt = await attemptByTracker(tracker).catch(() => null);
    return res.redirect(
      303,
      landingUrlFor({ outcome: 'unknown', purpose: attempt?.purpose as 'order' | 'wallet_topup' | undefined, orderId: attempt?.orderId }, true)
    );
  }
};

/**
 * Safepay webhook. Public; verified by the X-SFPY-SIGNATURE header. A successful-payment
 * event settles the checkout session it names (once; a retry or the customer's return having
 * done it already changes nothing). Answers 200 for anything it doesn't act on, so Safepay
 * stops retrying, and 500 only on a server error, so it retries.
 */
export const safepayWebhook = async (req: Request, res: Response) => {
  const signature = req.get('x-sfpy-signature') ?? undefined;
  if (!verifySafepayWebhook(req.body, signature)) {
    logger.warn('Safepay webhook with an invalid signature: rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const tracker = successfulTrackerFromWebhook(req.body);
  if (!tracker) {
    logger.info({ type: req.body?.type }, 'Safepay webhook ignored (not a successful payment)');
    return res.status(200).json({ received: true });
  }
  try {
    const result = await settleAttempt(tracker, 'webhook');
    return res.status(200).json({ received: true, outcome: result.outcome });
  } catch (err) {
    logger.error({ err, tracker }, 'Safepay webhook could not be applied');
    return res.status(500).json({ error: 'Internal error' });
  }
};
