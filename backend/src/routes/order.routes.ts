import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  reorder,
} from '../controllers/order.controller';
import { validate, validateQuery } from '../middleware/validation.middleware';
import {
  createOrderSchema,
  cancelOrderSchema,
  getOrdersQuerySchema,
} from '../validators/order.validator';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// Create order
router.post('/', validate(createOrderSchema), createOrder);

// Get user orders
router.get('/me', validateQuery(getOrdersQuerySchema), getMyOrders);

// Get order details
router.get('/:id', getOrderDetails);

// Cancel order
router.post('/:id/cancel', validate(cancelOrderSchema), cancelOrder);

// Reorder — re-add this order's items to the cart
router.post('/:id/reorder', reorder);

export default router;

