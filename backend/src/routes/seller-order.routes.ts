import { Router } from 'express';
import {
  getSellerOrders,
  getSellerOrderDetails,
  updateOrderItemStatus,
  cancelOrderItem,
  acceptOrder,
  rejectOrder,
  markOrderReady,
  dispatchOrder,
  deliverOrder,
  reportDeliveryFailed,
} from '../controllers/seller-order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  getSellerOrdersQuerySchema,
  updateOrderItemStatusSchema,
  cancelOrderItemSchema,
  deliverOrderSchema,
  deliveryFailedSchema,
} from '../validators/seller-order.validator';
import { authenticate, authorize, blockSuspendedSeller } from '../middleware/auth.middleware';
import { auditWrites } from '../middleware/audit';
import { ifStaffRequire } from '../middleware/staff';

const router = Router();

// All seller order routes require authentication and seller or admin role
router.use(authenticate);
router.use(authorize('seller', 'admin'));
router.use(ifStaffRequire('ops.write'));
// An admin acting as the kitchen on an order is recorded (a seller's own actions are not).
router.use(auditWrites('admin-as-seller', { onlyAdmins: true }));
router.use(blockSuspendedSeller);

// Get seller orders
router.get('/orders', validateQuery(getSellerOrdersQuerySchema), getSellerOrders);

// Get seller order details
router.get('/orders/:id', getSellerOrderDetails);

// Whole order lifecycle actions (Section 7 & 10)
router.post('/orders/:id/accept', acceptOrder);
router.post('/orders/:id/reject', rejectOrder);
router.post('/orders/:id/ready', markOrderReady);
// Self-delivery / pickup: the kitchen hands the order over itself
router.post('/orders/:id/dispatch', dispatchOrder);
router.post('/orders/:id/deliver', validate(deliverOrderSchema), deliverOrder);
router.post('/orders/:id/delivery-failed', validate(deliveryFailedSchema), reportDeliveryFailed);

// Update order item status
router.patch(
  '/orders/items/:id/status',
  validate(updateOrderItemStatusSchema),
  updateOrderItemStatus
);

// Cancel order item
router.post('/orders/items/:id/cancel', validate(cancelOrderItemSchema), cancelOrderItem);

export default router;

