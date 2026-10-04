import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  getSellerPaymentDetails,
  submitManualPayment,
  confirmManualPayment,
  getOrderMessages,
  sendOrderMessage,
} from '../controllers/order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  createOrderSchema,
  cancelOrderSchema,
  getOrdersQuerySchema,
} from '../validators/order.validator';
import { authenticate } from '../middleware/auth.middleware';
import { orderLimiter, messageLimiter, submissionLimiter } from '../middleware/rateLimiter';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// Create order
router.post('/', orderLimiter, validate(createOrderSchema), createOrder);

// Get user orders
router.get('/me', validateQuery(getOrdersQuerySchema), getMyOrders);

// Get order details
router.get('/:id', getOrderDetails);

// Cancel order
router.post('/:id/cancel', validate(cancelOrderSchema), cancelOrder);

// Manual online payment details & submission
router.get('/:id/payment-details', getSellerPaymentDetails);
router.post('/:id/submit-payment', submissionLimiter, submitManualPayment);
router.post('/:id/confirm-payment', confirmManualPayment);

// In-app order messages (buyer <-> seller/rider)
router.get('/:id/messages', getOrderMessages);
router.post('/:id/messages', messageLimiter, sendOrderMessage);

export default router;


