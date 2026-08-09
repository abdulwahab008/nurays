import { Router } from 'express';
import {
  getSellerOrders,
  getSellerOrderDetails,
  updateOrderItemStatus,
  cancelOrderItem,
} from '../controllers/seller-order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getSellerOrdersQuerySchema,
  updateOrderItemStatusSchema,
  cancelOrderItemSchema,
} from '../validators/seller-order.validator';
import { authenticate, authorize, blockSuspendedSeller } from '../middleware/auth.middleware';

const router = Router();

// All seller order routes require authentication and seller role
router.use(authenticate);
router.use(authorize('seller'));
router.use(blockSuspendedSeller);

// Get seller orders
router.get('/orders', validateQuery(getSellerOrdersQuerySchema), getSellerOrders);

// Get seller order details
router.get('/orders/:id', getSellerOrderDetails);

// Update order item status
router.patch(
  '/orders/items/:id/status',
  validate(updateOrderItemStatusSchema),
  updateOrderItemStatus
);

// Cancel order item
router.post('/orders/items/:id/cancel', validate(cancelOrderItemSchema), cancelOrderItem);

export default router;

