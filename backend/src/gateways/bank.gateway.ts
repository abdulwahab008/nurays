/**
 * Bank / IBFT / 1LINK Payment Gateway Adapter
 *
 * Bank payments in Pakistan are often done via:
 * - 1LINK (inter-bank fund transfer)
 * - Bank-specific merchant APIs (HBL, UBL, etc.)
 * - Or a payment aggregator (PayPro, etc.) that supports multiple banks
 *
 * The endpoint paths and request/response field names below (`/payments`,
 * `/payments/:ref/status`, `reference`, `status`, ...) are a placeholder REST
 * contract — adjust them to match whichever bank or aggregator BANK_API_URL
 * actually points at once one is chosen. What must NOT change: verifyPayment
 * only ever returns status 'completed' after an authenticated server-to-server
 * call to that API explicitly reports the payment as paid. Anything else —
 * an error, an unrecognized status, a network failure — must fail closed.
 */

import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

const BANK_API_URL = process.env.BANK_API_URL;
const BANK_MERCHANT_ID = process.env.BANK_MERCHANT_ID;
const BANK_API_KEY = process.env.BANK_API_KEY;
const BANK_RETURN_URL = process.env.BANK_RETURN_URL;

const PAID_STATES = new Set(['paid', 'completed', 'success', 'successful']);
const CANCELLED_STATES = new Set(['cancelled', 'canceled', 'void']);
const FAILED_STATES = new Set(['failed', 'declined', 'error', 'rejected']);

export const bankGateway: IPaymentGateway = {
  name: 'bank',

  isConfigured(): boolean {
    return !!(BANK_API_URL && BANK_MERCHANT_ID && BANK_API_KEY && BANK_RETURN_URL);
  },

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        paymentId: `BANK-MOCK-${Date.now()}`,
        message: 'Bank gateway is not configured. Set BANK_* env variables.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    try {
      const res = await fetch(`${BANK_API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BANK_API_KEY}`,
        },
        body: JSON.stringify({
          merchant_id: BANK_MERCHANT_ID,
          amount: Math.round(req.amountPkr),
          currency: 'PKR',
          order_id: req.orderId,
          order_number: req.orderNumber,
          return_url: BANK_RETURN_URL || req.returnUrl,
          cancel_url: req.cancelUrl,
        }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.reference) {
        return {
          success: false,
          paymentId: `BANK-ERROR-${Date.now()}`,
          message: json?.message || `Bank gateway create-payment failed (${res.status})`,
          errorCode: 'BANK_INIT_FAILED',
        };
      }

      return {
        success: true,
        paymentId: json.reference,
        redirectUrl: json.redirectUrl ?? json.redirect_url,
        transactionRef: json.reference,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };
    } catch (err: any) {
      return {
        success: false,
        paymentId: `BANK-ERROR-${Date.now()}`,
        message: err?.message ?? 'Bank gateway is unreachable',
        errorCode: 'BANK_INIT_FAILED',
      };
    }
  },

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'failed',
        message: 'Bank gateway is not configured.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    try {
      // Real server-to-server status inquiry — never trust a client-supplied
      // "it's paid" claim. This is the check that was previously faked.
      const res = await fetch(
        `${BANK_API_URL}/payments/${encodeURIComponent(req.paymentId)}/status`,
        { headers: { Authorization: `Bearer ${BANK_API_KEY}` } }
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json) {
        return {
          success: false,
          status: 'failed',
          message: json?.message || `Bank gateway status check failed (${res.status})`,
          errorCode: 'BANK_VERIFY_FAILED',
        };
      }

      const remoteStatus = String(json.status ?? '').toLowerCase();
      if (PAID_STATES.has(remoteStatus)) {
        return {
          success: true,
          status: 'completed',
          transactionId: json.transaction_id ?? json.reference ?? req.paymentId,
          paidAt: json.paid_at ? new Date(json.paid_at) : new Date(),
          amountPkr: json.amount != null ? Number(json.amount) : undefined,
        };
      }
      if (CANCELLED_STATES.has(remoteStatus)) {
        return { success: false, status: 'cancelled', message: 'Payment was cancelled' };
      }
      if (FAILED_STATES.has(remoteStatus)) {
        return { success: false, status: 'failed', message: `Bank reported status: ${remoteStatus}` };
      }
      // Any unrecognized or in-progress state is treated as pending — never assume paid.
      return { success: false, status: 'pending', message: `Payment status: ${remoteStatus || 'unknown'}` };
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        message: err?.message ?? 'Bank gateway verification failed',
        errorCode: 'BANK_VERIFY_FAILED',
      };
    }
  },
};
