import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get notifications
router.get('/', getNotifications);

// Mark notification as read
router.patch('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/read-all', markAllAsRead);

export default router;

