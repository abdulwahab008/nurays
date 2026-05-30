/**
 * EasyPaisa Payment Gateway Adapter
 *
 * How to integrate:
 * 1. Register at https://easypay.easypaisa.com.pk/easypay-merchant/
 * 2. Get Store ID and API key (use Sandbox for testing)
 * 3. Set EASYPAISA_STORE_ID, EASYPAISA_API_KEY, EASYPAISA_RETURN_URL in .env
 * 4. Implement createPayment: call EasyPaisa REST API (Mobile Account / OTC / etc. per their docs)
 * 5. Implement verifyPayment: use callback or "Transaction Status" API with SecureHash verification
 *
 * Docs: https://easypay.easypaisa.com.pk/easypay-merchant/faces/pg/site/IntegrationGuides.jsf
 */

import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

const STORE_ID = process.env.EASYPAISA_STORE_ID;
const API_KEY = process.env.EASYPAISA_API_KEY;
const RETURN_URL = process.env.EASYPAISA_RETURN_URL;
const SANDBOX = process.env.EASYPAISA_SANDBOX === 'true';
const BASE_URL = SANDBOX
  ? 'https://easypaystg.easypaisa.com.pk/easypay/'
  : 'https://easypay.easypaisa.com.pk/easypay/';

export const easypaisaGateway: IPaymentGateway = {
  name: 'easypaisa',

  isConfigured(): boolean {
    return !!(STORE_ID && API_KEY && RETURN_URL);
  },

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        paymentId: `EP-MOCK-${Date.now()}`,
        message: 'EasyPaisa is not configured. Set EASYPAISA_* env variables.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    // TODO: Replace with real EasyPaisa REST API call.
    // EasyPaisa supports: OTC, MAC (Mobile Account), etc.
    // Typical flow: POST to their API with storeId, amount, orderId, expiryDate, postBackURL, etc.
    // They may return a payment token or redirect URL. See Integration Guide for exact parameters and hashing.

    const amountPkr = Math.round(req.amountPkr);
    const txnRefNo = `EP-${req.orderId.slice(0, 8)}-${Date.now()}`;
    const paymentId = txnRefNo;

    // Placeholder redirect (real implementation uses URL from API response)
    const redirectUrl = `${BASE_URL}?storeId=${STORE_ID}&orderId=${paymentId}&amount=${amountPkr}&returnUrl=${encodeURIComponent(req.returnUrl)}`;

    return {
      success: true,
      paymentId,
      redirectUrl,
      transactionRef: txnRefNo,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  },

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'failed',
        message: 'EasyPaisa is not configured.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    // TODO: Call EasyPaisa "Transaction Status" API or verify webhook/callback SecureHash.
    // Return status: completed | pending | failed | cancelled.

    return {
      success: true,
      status: 'completed',
      transactionId: req.transactionId || req.paymentId,
      paidAt: new Date(),
    };
  },
};
