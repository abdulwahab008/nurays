/**
 * Safepay Payment Gateway Adapter
 * Docs: https://getsafepay.com/docs
 *
 * Flow:
 *  1. POST /order/v1/init  →  get { token }
 *  2. Redirect customer to Safepay checkout page with that token
 *  3. Safepay POSTs to your webhook when paid
 *  4. Webhook handler marks order as paid
 *
 * Env vars needed:
 *   SAFEPAY_PUBLIC_KEY   – from Safepay dashboard (client key)
 *   SAFEPAY_SECRET_KEY   – from Safepay dashboard (secret key, keep private)
 *   SAFEPAY_SANDBOX=true – use sandbox environment
 */

import crypto from 'crypto';
import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

const PUBLIC_KEY  = process.env.SAFEPAY_PUBLIC_KEY;
const SECRET_KEY  = process.env.SAFEPAY_SECRET_KEY;
const SANDBOX     = process.env.SAFEPAY_SANDBOX !== 'false'; // default sandbox

const API_BASE      = SANDBOX
  ? 'https://sandbox.api.getsafepay.com'
  : 'https://api.getsafepay.com';

const CHECKOUT_BASE = 'https://getsafepay.pk/checkout'; // correct hosted checkout path

/** POST to Safepay API — uses Bearer auth with the secret key */
async function safepayPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Safepay API error ${res.status}`);
  }
  return json as T;
}

export const safepayGateway: IPaymentGateway = {
  name: 'safepay',

  isConfigured(): boolean {
    return !!(PUBLIC_KEY && SECRET_KEY);
  },

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        paymentId: `SF-UNCONFIGURED-${Date.now()}`,
        message: 'Safepay is not configured. Set SAFEPAY_PUBLIC_KEY and SAFEPAY_SECRET_KEY.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    try {
      // Step 1: Create a checkout session and retrieve the tracker token
      const initRes = await safepayPost<{ data: { token: string } }>('/order/v1/init', {
        client:      PUBLIC_KEY,
        amount:      Math.round(req.amountPkr),   // PKR, no decimals
        currency:    'PKR',
        order_id:    req.orderId,
        environment: SANDBOX ? 'sandbox' : 'production',
      });

      const token = initRes?.data?.token;
      if (!token) throw new Error('No token in Safepay init response');

      // Step 2: Build checkout redirect URL
      const params = new URLSearchParams({
        env:          SANDBOX ? 'sandbox' : 'production',
        beacon:       token,
        order_id:     req.orderId,
        source:       'custom',
        redirect_url: req.returnUrl,
        cancel_url:   req.cancelUrl,
      });
      if (req.customerEmail) params.set('email', req.customerEmail);

      const redirectUrl = `${CHECKOUT_BASE}?${params.toString()}`;

      return {
        success:      true,
        paymentId:    token,           // we store the Safepay token as paymentId
        redirectUrl,
        transactionRef: token,
        expiresAt:    new Date(Date.now() + 30 * 60 * 1000), // 30-minute session
      };
    } catch (err: any) {
      return {
        success:   false,
        paymentId: `SF-ERROR-${Date.now()}`,
        message:   err?.message ?? 'Safepay initiation failed',
        errorCode: 'SAFEPAY_INIT_FAILED',
      };
    }
  },

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      return { success: false, status: 'failed', message: 'Safepay not configured', errorCode: 'GATEWAY_NOT_CONFIGURED' };
    }

    try {
      // GET /order/v1/inquiry?token={paymentId}
      const res = await fetch(
        `${API_BASE}/order/v1/inquiry?token=${encodeURIComponent(req.paymentId)}`,
        {
          headers: { Authorization: `Bearer ${SECRET_KEY}` },
        }
      );
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.message ?? `Safepay inquiry error ${res.status}`);

      const state: string = json?.data?.tracker?.state ?? json?.data?.state ?? '';

      // Safepay states: TRACKER_INITIATED, TRACKER_PAID, TRACKER_CANCELLED, etc.
      if (state === 'TRACKER_PAID') {
        return {
          success:       true,
          status:        'completed',
          transactionId: json?.data?.tracker?.token ?? req.paymentId,
          paidAt:        new Date(),
          amountPkr:     json?.data?.tracker?.amount ?? undefined,
        };
      }
      if (state === 'TRACKER_CANCELLED') {
        return { success: false, status: 'cancelled', message: 'Payment was cancelled' };
      }
      return { success: false, status: 'pending', message: `Payment state: ${state}` };
    } catch (err: any) {
      return { success: false, status: 'failed', message: err?.message ?? 'Verification failed', errorCode: 'SAFEPAY_VERIFY_FAILED' };
    }
  },
};

/**
 * Verify the HMAC-SHA256 webhook signature sent by Safepay.
 * Safepay signs the raw request body with your secret key.
 *
 * Usage:
 *   const valid = verifySafepayWebhook(req.rawBody, req.headers['x-sfpy-hmac-sha256']);
 */
export function verifySafepayWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!SECRET_KEY || !signature) return false;
  const expected = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  // Use timingSafeEqual to avoid timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
