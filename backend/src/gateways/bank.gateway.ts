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

export const bankGateway: IPaymentGateway = {
  name: 'bank',

  // Direct bank/IBFT integration is not implemented; stays unconfigured so it
  // can never confirm a payment without real settlement.
  isConfigured(): boolean {
    return false;
  },

  async createPayment(_req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    return {
      success: false,
      paymentId: `BANK-UNAVAILABLE-${Date.now()}`,
      message: 'Direct bank integration is not implemented.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },

  async verifyPayment(_req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return {
      success: false,
      status: 'failed',
      message: 'Direct bank verification is not implemented; refusing to confirm payment.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },
};
