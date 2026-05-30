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

const MERCHANT_ID = process.env.JAZZCASH_MERCHANT_ID;
const PASSWORD = process.env.JAZZCASH_PASSWORD;
const RETURN_URL = process.env.JAZZCASH_RETURN_URL;
const CANCEL_URL = process.env.JAZZCASH_CANCEL_URL;
const SANDBOX = process.env.JAZZCASH_SANDBOX === 'true';
const BASE_URL = SANDBOX
  ? 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/'
  : 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';

export const jazzcashGateway: IPaymentGateway = {
  name: 'jazzcash',

  isConfigured(): boolean {
    return !!(MERCHANT_ID && PASSWORD && RETURN_URL && CANCEL_URL);
  },

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        paymentId: `JC-MOCK-${Date.now()}`,
        message: 'JazzCash is not configured. Set JAZZCASH_* env variables.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    // TODO: Replace with real JazzCash API call.
    // JazzCash typically uses:
    // - POST to their endpoint with MerchantId, Password, Amount (in paisa or whole PKR), TxnRefNo, TxnDateTime,
    //   ReturnURL, SecureHash (HMAC of required fields per their spec).
    // - Response contains payment token or redirect URL.
    // See: JazzCash Sandbox Documentation > API References > Payment Request / Mobile Account.

    const amountPkr = Math.round(req.amountPkr);
    const txnRefNo = `JC-${req.orderId.slice(0, 8)}-${Date.now()}`;
    const paymentId = txnRefNo;

    // Placeholder: build redirect URL (real implementation uses API response URL)
    const redirectUrl = `${BASE_URL}?pp_MerchantID=${MERCHANT_ID}&pp_Amount=${amountPkr * 100}&pp_TxnRefNo=${txnRefNo}&pp_ReturnURL=${encodeURIComponent(req.returnUrl)}&pp_TxnDateTime=${new Date().toISOString().replace(/[-:]/g, '').slice(0, 14)}`;
    // In production: compute SecureHash per JazzCash docs and use the URL they return.

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
        message: 'JazzCash is not configured.',
        errorCode: 'GATEWAY_NOT_CONFIGURED',
      };
    }

    // TODO: Call JazzCash "Payment Inquiry" or "Transaction Status" API with req.paymentId / req.transactionId.
    // Verify SecureHash on callback/webhook if using redirect callback.
    // Return status: completed | pending | failed | cancelled.

    return {
      success: true,
      status: 'completed',
      transactionId: req.transactionId || req.paymentId,
      paidAt: new Date(),
    };
  },
};
