import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as stockAlertController from '../controllers/stock-alert.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get stock alerts for seller
router.get('/', stockAlertController.getStockAlerts);

// Mark alert as read
router.patch('/:alertId/read', stockAlertController.markAsRead);

// Dismiss alert
router.patch('/:alertId/dismiss', stockAlertController.dismissAlert);

export default router;
