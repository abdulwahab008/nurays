/**
 * JazzCash direct merchant integration: NOT IMPLEMENTED.
 *
 * Customers can still pay with JazzCash two ways:
 *  - through Safepay's hosted checkout (online, collected by the platform), or
 *  - by a manual transfer into the kitchen's own JazzCash account, confirmed by the
 *    seller (see order.service getSellerPaymentDetails / confirmManualPayment).
 *
 * A direct JazzCash merchant integration needs the merchant's hosted-checkout
 * request signing, callback signature verification and a status-inquiry call
 * against the real API. Until that exists and has been tested against the
 * JazzCash sandbox, this adapter refuses every request. It must never report a
 * payment as completed: an earlier placeholder did, which let anyone mark an
 * order paid without paying.
 */

import type {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './types';

const NOT_IMPLEMENTED = 'Direct JazzCash payments are not available. Pay online through the card / wallet checkout, or by transfer to the kitchen.';

export const jazzcashGateway: IPaymentGateway = {
  name: 'jazzcash',

  isConfigured(): boolean {
    return false;
  },

  async createPayment(_req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    return { success: false, paymentId: '', message: NOT_IMPLEMENTED, errorCode: 'GATEWAY_NOT_IMPLEMENTED' };
  },

  async verifyPayment(_req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return { success: false, status: 'failed', message: NOT_IMPLEMENTED, errorCode: 'GATEWAY_NOT_IMPLEMENTED' };
  },
};
