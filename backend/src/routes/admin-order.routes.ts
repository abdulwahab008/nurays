import { Router } from 'express';
import {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  processRefund,
  getPlatformAnalytics,
  getOrderStatistics,
  listPayouts,
  completePayout,
  failPayout,
} from '../controllers/admin-order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getAdminOrdersQuerySchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  processRefundSchema,
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

// Process refund
router.post('/orders/:id/refund', validate(processRefundSchema), processRefund);

// Seller payout management
router.get('/payouts', listPayouts);
router.post('/payouts/:id/complete', completePayout);
router.post('/payouts/:id/fail', failPayout);

export default router;

