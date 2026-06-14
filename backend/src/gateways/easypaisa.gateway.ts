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

export const easypaisaGateway: IPaymentGateway = {
  name: 'easypaisa',

  // Direct EasyPaisa integration is not implemented; checkout routes EasyPaisa
  // through the Safepay aggregator. Stays unconfigured so it can never confirm
  // a payment without real settlement.
  isConfigured(): boolean {
    return false;
  },

  async createPayment(_req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    return {
      success: false,
      paymentId: `EP-UNAVAILABLE-${Date.now()}`,
      message: 'Direct EasyPaisa integration is not implemented. Use the Safepay aggregator.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },

  async verifyPayment(_req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return {
      success: false,
      status: 'failed',
      message: 'Direct EasyPaisa verification is not implemented; refusing to confirm payment.',
      errorCode: 'GATEWAY_NOT_IMPLEMENTED',
    };
  },
};
