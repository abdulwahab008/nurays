import { z } from 'zod';

export const processPaymentSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  paymentMethod: z.enum(['jazzcash', 'easypaisa', 'bank', 'card', 'cod', 'wallet', 'safepay']),
  // Card details are entered on the payment provider's page, never sent to this API.
});

export const verifyPaymentSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  transactionId: z.string().optional(),
});

export const walletTopupSchema = z.object({
  amount: z.number().positive('Enter an amount'),
});
