import { z } from 'zod';

export const processPaymentSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  paymentMethod: z.enum(['jazzcash', 'easypaisa', 'bank', 'card', 'cod', 'wallet', 'safepay']),
  paymentDetails: z
    .object({
      accountNumber: z.string().optional(),
      cardNumber: z.string().optional(),
      cvv: z.string().optional(),
      expiryDate: z.string().optional(),
    })
    .optional(),
});

export const verifyPaymentSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  transactionId: z.string().optional(),
});

