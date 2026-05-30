import { Router } from 'express';
import { getOrderTracking } from '../controllers/realtime-order.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All real-time routes require authentication
router.use(authenticate);

// Get order tracking (for WebSocket connection setup)
router.get('/orders/:id/track', getOrderTracking);

export default router;

