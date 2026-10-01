import { Router } from 'express';
import {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  retryDelivery,
  processRefund,
  listRefunds,
  completeRefund,
  dismissRefund,
  getPlatformAnalytics,
  getOrderStatistics,
} from '../controllers/admin-order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getAdminOrdersQuerySchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  processRefundSchema,
  completeRefundSchema,
  dismissRefundSchema,
  listRefundsQuerySchema,
  getAnalyticsQuerySchema,
} from '../validators/admin-order.validator';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All admin order routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Get platform analytics
router.get('/analytics', validateQuery(getAnalyticsQuerySchema), getPlatformAnalytics);

// Get order statistics
router.get('/statistics', getOrderStatistics);

// Get all orders
router.get('/orders', validateQuery(getAdminOrdersQuerySchema), getAllOrders);

// Get order details
router.get('/orders/:id', getOrderDetails);

// Update order status
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), updateOrderStatus);

// Cancel order
router.post('/orders/:id/cancel', validate(cancelOrderSchema), cancelOrder);

// Retry a failed delivery — send it back out instead of cancelling
router.post('/orders/:id/retry-delivery', retryDelivery);

// Process refund
router.post('/orders/:id/refund', validate(processRefundSchema), processRefund);

// Refund queue: refunds owed to customers, and confirming a manual one was sent
router.get('/refunds', validateQuery(listRefundsQuerySchema), listRefunds);
router.post('/refunds/:refundId/complete', validate(completeRefundSchema), completeRefund);
router.post('/refunds/:refundId/dismiss', validate(dismissRefundSchema), dismissRefund);

export default router;

