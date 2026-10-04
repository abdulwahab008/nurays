import { Router } from 'express';
import {
  getPaymentMethods,
  processPayment,
  verifyPayment,
  getOrderPaymentStatus,
  getWalletBalance,
  getWalletTransactions,
  topUpWallet,
  safepayReturn,
  safepayWebhook,
} from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { submissionLimiter } from '../middleware/rateLimiter';
import { processPaymentSchema, verifyPaymentSchema, walletTopupSchema } from '../validators/payment.validator';

const router = Router();

// Public routes (no auth)
router.get('/methods', getPaymentMethods);

// Safepay: where the customer comes back after paying (signed), and its server-to-server
// webhook (signed). Both settle the checkout session once.
router.get('/safepay/return', safepayReturn);
router.post('/safepay/return', safepayReturn);
router.post('/safepay-webhook', safepayWebhook);

// All other routes require authentication
router.use(authenticate);

// Pay an order: from the wallet, or start an online checkout
router.post('/process', submissionLimiter, validate(processPaymentSchema), processPayment);

// Has an order's payment come through? (read-only)
router.post('/verify', validate(verifyPaymentSchema), verifyPayment);
router.get('/orders/:orderId/status', getOrderPaymentStatus);

// Wallet
router.get('/wallet', getWalletBalance);
router.get('/wallet/transactions', getWalletTransactions);
router.post('/wallet/topup', submissionLimiter, validate(walletTopupSchema), topUpWallet);

export default router;
