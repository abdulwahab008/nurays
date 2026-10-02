/**
 * Safepay (https://getsafepay.com): hosted checkout for cards, JazzCash and EasyPaisa.
 *
 * Follows Safepay's official Node SDK (@sfpy/node-sdk 3.x and @sfpy/node-core):
 *  1. POST {api}/order/v1/init { client: public key, amount, currency, environment } → a
 *     "tracker" token for one checkout session (the amount is fixed here).
 *  2. Send the customer to {checkout}?beacon=<tracker>&order_id&redirect_url&cancel_url&...
 *  3. After paying, Safepay form-POSTs { tracker, sig, reference, order_id } to redirect_url.
 *     sig = HMAC-SHA256(tracker) with the secret key.
 *  4. With webhooks on, Safepay also POSTs events to the endpoint set in its dashboard,
 *     signed in the X-SFPY-SIGNATURE header: HMAC-SHA512 of JSON.stringify(body.data) with the
 *     webhook shared secret.
 *  5. Server-side lookup of a tracker: GET {api}/reporter/api/v1/payments/{tracker} with the
 *     secret key in the x-sfpy-merchant-secret header. Used for diagnostics only: a payment is
 *     settled only by a signed return (3) or a verified webhook (4), never by a lookup whose
 *     state names this code can't be sure of.
 *
 * The init amount is in rupees (decimals allowed), as in Safepay's classic integration;
 * confirm in the sandbox before going live.
 *
 * Env: SAFEPAY_PUBLIC_KEY, SAFEPAY_SECRET_KEY, SAFEPAY_WEBHOOK_SECRET, SAFEPAY_SANDBOX
 * (anything but "false" = sandbox). SAFEPAY_API_URL / SAFEPAY_CHECKOUT_URL override the hosts
 * (tests use a local stand-in).
 */

import crypto from 'crypto';
import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

const env = () => (process.env.SAFEPAY_SANDBOX === 'false' ? 'production' : 'sandbox');
const apiBase = () =>
  process.env.SAFEPAY_API_URL || (env() === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com');
const checkoutBase = () =>
  process.env.SAFEPAY_CHECKOUT_URL ||
  (env() === 'production' ? 'https://getsafepay.com/checkout' : 'https://sandbox.api.getsafepay.com/checkout');
const publicKey = () => process.env.SAFEPAY_PUBLIC_KEY?.trim() || '';
const secretKey = () => process.env.SAFEPAY_SECRET_KEY?.trim() || '';
const webhookSecret = () => process.env.SAFEPAY_WEBHOOK_SECRET?.trim() || '';

const REQUEST_TIMEOUT_MS = 15_000;

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(received).trim().toLowerCase(), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SafepayCheckout {
  tracker: string;
  redirectUrl: string;
}

/** Start a checkout session for `amount` rupees and build the page to send the customer to. */
export async function createSafepayCheckout(opts: {
  amount: number;
  reference: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<SafepayCheckout> {
  const res = await fetch(`${apiBase()}/order/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: publicKey(),
      amount: Math.round(opts.amount * 100) / 100,
      currency: 'PKR',
      environment: env(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { token?: string }; message?: string; status?: { message?: string } };
  if (!res.ok) throw new Error(json?.message || json?.status?.message || `Safepay init failed (${res.status})`);
  const tracker = json?.data?.token;
  if (!tracker) throw new Error('Safepay did not return a tracker');

  const params = new URLSearchParams({
    beacon: tracker,
    cancel_url: opts.cancelUrl,
    env: env(),
    order_id: opts.reference,
    redirect_url: opts.returnUrl,
    source: 'custom',
    webhooks: 'true',
  });
  return { tracker, redirectUrl: `${checkoutBase()}?${params.toString()}` };
}

/** The signature Safepay sends back with the customer: HMAC-SHA256 of the tracker, secret key. */
export function verifySafepayReturn(tracker: string | undefined, sig: string | undefined): boolean {
  const secret = secretKey();
  if (!secret || !tracker || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(tracker).digest('hex');
  return safeEqualHex(expected, sig);
}

/** A webhook's X-SFPY-SIGNATURE: HMAC-SHA512 of JSON.stringify(body.data), webhook secret. */
export function verifySafepayWebhook(body: unknown, signature: string | undefined): boolean {
  const secret = webhookSecret();
  const data = (body as { data?: unknown } | null)?.data;
  if (!secret || !signature || data === undefined) return false;
  const expected = crypto.createHmac('sha512', secret).update(Buffer.from(JSON.stringify(data))).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Safepay's own record of a checkout session (diagnostics). Throws when it can't be reached. */
export async function fetchSafepayPayment(tracker: string): Promise<{ state: string; raw: unknown }> {
  const res = await fetch(`${apiBase()}/reporter/api/v1/payments/${encodeURIComponent(tracker)}`, {
    headers: { 'x-sfpy-merchant-secret': secretKey() },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(json?.message || json?.status?.message || `Safepay lookup failed (${res.status})`);
  const data = json?.data ?? {};
  const state = String(data?.tracker?.state ?? data?.state ?? data?.payment?.state ?? '').toUpperCase();
  return { state, raw: data };
}

export const safepayGateway: IPaymentGateway = {
  name: 'safepay',

  isConfigured(): boolean {
    return !!(publicKey() && secretKey());
  },

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return { success: false, paymentId: '', message: 'Safepay is not configured', errorCode: 'GATEWAY_NOT_CONFIGURED' };
    }
    try {
      const checkout = await createSafepayCheckout({
        amount: req.amountPkr,
        reference: req.orderId,
        returnUrl: req.returnUrl,
        cancelUrl: req.cancelUrl,
      });
      return {
        success: true,
        paymentId: checkout.tracker,
        transactionRef: checkout.tracker,
        redirectUrl: checkout.redirectUrl,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };
    } catch (err: any) {
      return { success: false, paymentId: '', message: err?.message ?? 'Safepay initiation failed', errorCode: 'SAFEPAY_INIT_FAILED' };
    }
  },

  // Reports where Safepay says the session stands, but never 'completed': Safepay payments
  // are settled only by the signed return or a verified webhook (see payment.service).
  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      return { success: false, status: 'failed', message: 'Safepay not configured', errorCode: 'GATEWAY_NOT_CONFIGURED' };
    }
    try {
      const { state } = await fetchSafepayPayment(req.paymentId);
      return { success: false, status: 'pending', message: `Safepay reports: ${state || 'unknown'}` };
    } catch (err: any) {
      return { success: false, status: 'failed', message: err?.message ?? 'Lookup failed', errorCode: 'SAFEPAY_VERIFY_FAILED' };
    }
  },
};
