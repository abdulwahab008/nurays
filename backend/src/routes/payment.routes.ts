import { Router } from 'express';
import {
  getPaymentMethods,
  processPayment,
  verifyPayment,
  getWalletBalance,
  safepayWebhook,
} from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { processPaymentSchema, verifyPaymentSchema } from '../validators/payment.validator';

const router = Router();

// Public routes (no auth)
router.get('/methods', getPaymentMethods);

// Safepay webhook — must be public, Safepay calls this from their server
// express.json() is applied globally BUT we also need the raw body for HMAC verification.
// The rawBody is attached in index.ts before express.json() runs.
router.post('/safepay-webhook', safepayWebhook);

// All other routes require authentication
router.use(authenticate);

// Process payment
router.post('/process', validate(processPaymentSchema), processPayment);

// Verify payment
router.post('/verify', validate(verifyPaymentSchema), verifyPayment);

// Get wallet balance
router.get('/wallet', getWalletBalance);

export default router;

