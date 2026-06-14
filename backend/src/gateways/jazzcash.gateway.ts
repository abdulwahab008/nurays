/**
 * JazzCash Payment Gateway Adapter
 *
 * How to integrate:
 * 1. Register at https://payments.jazzcash.com.pk (Merchant onboarding)
 * 2. Get Merchant ID and Password (use Sandbox for testing)
 * 3. Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_RETURN_URL, JAZZCASH_CANCEL_URL in .env
 * 4. Implement createPayment: call JazzCash "Payment Request" / "Mobile Account" API (see their docs)
 * 5. Implement verifyPayment: call JazzCash "Payment Inquiry" or use callback/webhook with SecureHash verification
 *
 * Docs: https://payments.jazzcash.com.pk/SandboxDocumentation/ApiReferences.html
 * Integration guide: Payment Gateway Integration Guide for Merchants (PDF from JazzCash)
 */

import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

export const jazzcashGateway: IPaymentGateway = {
  name: 'jazzcash',

  // The direct JazzCash integration is not implemented, so this gateway is
  // never "configured". Checkout routes JazzCash through the Safepay
  // aggregator instead. To enable direct JazzCash, implement create/verify
  // below and gate this on the JAZZCASH_* env vars.
  isConfigured(): boolean {
    return false;
  },

  // The direct JazzCash API integration (SecureHash, Payment Inquiry) is not
  // implemented. Until it is, this adapter MUST fail closed so a payment can
  // never be marked paid without real settlement. In production the checkout
  // routes JazzCash through the Safepay aggregator, which is fully implemented.
  async createPayment(_req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    return {
      success: false,
      paymentId: `JC-UNAVAILABLE-${Date.now()}`,
      message: 'Direct JazzCash integration is not implemented. Use the Safepay aggregator.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },

  async verifyPayment(_req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return {
      success: false,
      status: 'failed',
      message: 'Direct JazzCash verification is not implemented; refusing to confirm payment.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },
};
