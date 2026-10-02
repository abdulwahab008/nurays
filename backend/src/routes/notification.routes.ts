import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  getPushPublicKey,
  subscribePush,
  unsubscribePush,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { preferencesSchema, pushSubscriptionSchema, pushUnsubscribeSchema } from '../validators/notification.validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get notifications
router.get('/', getNotifications);

// Which notifications reach me, and how
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', validate(preferencesSchema), updateNotificationPreferences);

// Push notifications on this device
router.get('/push/public-key', getPushPublicKey);
router.post('/push/subscriptions', validate(pushSubscriptionSchema), subscribePush);
router.delete('/push/subscriptions', validate(pushUnsubscribeSchema), unsubscribePush);

// Mark notification as read
router.patch('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/read-all', markAllAsRead);

export default router;

