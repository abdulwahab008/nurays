import { Request, Response } from 'express';
import { getPreferences, updatePreferences } from '../services/notify.service';
import { vapidPublicKey, saveSubscription, removeSubscription } from '../services/push.service';
import notificationService from '../services/notification.service';
import { AppError } from '../middleware/errorHandler';

export const getNotifications = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const isRead = req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined;

  const result = await notificationService.getNotifications(req.user.userId, {
    page,
    limit,
    isRead,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const markAsRead = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  await notificationService.markAsRead(id, req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
  });
};

export const markAllAsRead = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  await notificationService.markAllAsRead(req.user.userId);

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
  });
};


// ---- preferences and devices ----

const uid = (req: Request) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
};

export const getNotificationPreferences = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await getPreferences(uid(req)) });
};

export const updateNotificationPreferences = async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await updatePreferences(uid(req), req.body?.preferences), message: 'Notification settings saved' });
};

export const getPushPublicKey = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { publicKey: vapidPublicKey() } });
};

export const subscribePush = async (req: Request, res: Response) => {
  await saveSubscription(uid(req), req.body, req.get('user-agent'));
  res.status(201).json({ success: true, message: 'Notifications are on for this device' });
};

export const unsubscribePush = async (req: Request, res: Response) => {
  await removeSubscription(uid(req), req.body.endpoint);
  res.status(200).json({ success: true, message: 'Notifications are off for this device' });
};
