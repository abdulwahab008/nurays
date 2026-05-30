/**
 * Bank / IBFT / 1LINK Payment Gateway Adapter
 *
 * Bank payments in Pakistan are often done via:
 * - 1LINK (inter-bank fund transfer)
 * - Bank-specific merchant APIs (HBL, UBL, etc.)
 * - Or a payment aggregator (PayPro, etc.) that supports multiple banks
 *
 * How to integrate:
 * 1. Contact your bank or an aggregator for "e-commerce / IBFT merchant" API.
 * 2. Set BANK_API_URL, BANK_MERCHANT_ID, BANK_API_KEY (or similar) in .env.
 * 3. Implement createPayment: redirect user to bank page or return payment token.
 * 4. Implement verifyPayment: on return or webhook, verify with bank API and mark order paid.
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

    // TODO: Call your bank/aggregator "create payment" API.
    // Typically: amount, order ref, return URL, merchant id, signature.
    // They return redirectUrl or payment token for frontend.

    const amountPkr = Math.round(req.amountPkr);
    const txnRefNo = `BANK-${req.orderId.slice(0, 8)}-${Date.now()}`;

    return {
      success: true,
      paymentId: txnRefNo,
      redirectUrl: `${BANK_API_URL}/pay?ref=${txnRefNo}&amount=${amountPkr}&return=${encodeURIComponent(req.returnUrl)}`,
      transactionRef: txnRefNo,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
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

    // TODO: Call bank/aggregator "transaction status" or verify webhook signature.

    return {
      success: true,
      status: 'completed',
      transactionId: req.transactionId || req.paymentId,
      paidAt: new Date(),
    };
  },
};
