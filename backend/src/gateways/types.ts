/**
 * Shared types for payment gateway adapters.
 * Used by JazzCash, EasyPaisa, Bank, etc.
 */

export interface CreatePaymentRequest {
  orderId: string;
  orderNumber: string;
  amountPkr: number; // Integer, no decimals (PKR)
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
  cancelUrl: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentResult {
  success: boolean;
  paymentId: string;
  redirectUrl?: string; // User is redirected here to complete payment
  transactionRef?: string;
  expiresAt?: Date;
  message?: string;
  errorCode?: string;
}

export interface VerifyPaymentRequest {
  paymentId: string;
  transactionId?: string;
  orderId?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  transactionId?: string;
  paidAt?: Date;
  amountPkr?: number;
  message?: string;
  errorCode?: string;
}

export interface IPaymentGateway {
  name: string;
  isConfigured(): boolean;
  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
}
