import { Request, Response } from 'express';
import * as stockAlertService from '../services/stock-alert.service';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';

export const getStockAlerts = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });

  if (!seller) {
    throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
  }

  const filters = {
    isRead: req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined,
    isDismissed: req.query.isDismissed === 'true' ? true : req.query.isDismissed === 'false' ? false : undefined,
    alertType: req.query.alertType as 'low_stock' | 'out_of_stock' | undefined,
  };

  const alerts = await stockAlertService.getSellerStockAlerts(seller.id, filters);

  res.status(200).json({
    success: true,
    data: alerts,
  });
};

export const markAsRead = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });

  if (!seller) {
    throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
  }

  const { alertId } = req.params;
  const alert = await stockAlertService.markAlertAsRead(alertId, seller.id);

  res.status(200).json({
    success: true,
    message: 'Alert marked as read',
    data: alert,
  });
};

export const dismissAlert = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });

  if (!seller) {
    throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
  }

  const { alertId } = req.params;
  const alert = await stockAlertService.dismissAlert(alertId, seller.id);

  res.status(200).json({
    success: true,
    message: 'Alert dismissed',
    data: alert,
  });
};
