import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class NotificationService {
  /**
   * Create a notification for a user (e.g. new order for seller)
   */
  async createNotification(
    userId: string,
    data: {
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
      actionUrl?: string;
    }
  ) {
    const notif = await prisma.notification.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data != null ? (data.data as Prisma.InputJsonValue) : undefined,
        actionUrl: data.actionUrl ?? undefined,
      },
    });
    return notif;
  }

  /**
   * Get notifications
   */
  async getNotifications(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      isRead?: boolean;
    }
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
    };

    if (filters.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications: notifications.map((notif) => ({
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        data: notif.data,
        actionUrl: notif.actionUrl,
        isRead: notif.isRead,
        createdAt: notif.createdAt,
      })),
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }

    if (notification.userId !== userId) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}

export default new NotificationService();

