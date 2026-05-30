import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  validateCart,
  getDeliveryFeeEstimate,
} from '../controllers/cart.controller';
import { validate } from '../middleware/validation.middleware';
import {
  addToCartSchema,
  updateCartItemSchema,
} from '../validators/cart.validator';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All cart routes require authentication
router.use(authenticate);

// Get cart
router.get('/', getCart);

// Validate cart (for checkout)
router.get('/validate', validateCart);

// Delivery fee estimate for checkout (query: addressId)
router.get('/delivery-estimate', getDeliveryFeeEstimate);

// Add to cart
router.post('/items', validate(addToCartSchema), addToCart);

// Update cart item
router.patch('/items/:id', validate(updateCartItemSchema), updateCartItem);

// Remove from cart
router.delete('/items/:id', removeFromCart);

// Clear cart
router.delete('/', clearCart);

export default router;

