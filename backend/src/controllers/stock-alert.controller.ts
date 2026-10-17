import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import * as stockAlertService from '../services/stock-alert.service';
import { currentSellerId } from '../middleware/auth.middleware';

export const getStockAlerts = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const filters = {
    isRead: req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined,
    isDismissed: req.query.isDismissed === 'true' ? true : req.query.isDismissed === 'false' ? false : undefined,
    alertType: (['low_stock', 'out_of_stock'].includes(qstr(req.query.alertType) ?? '') ? qstr(req.query.alertType) : undefined) as 'low_stock' | 'out_of_stock' | undefined,
  };

  const alerts = await stockAlertService.getSellerStockAlerts(sellerId, filters);

  res.status(200).json({
    success: true,
    data: alerts,
  });
};

export const markAsRead = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const { alertId } = req.params;
  const alert = await stockAlertService.markAlertAsRead(alertId, sellerId);

  res.status(200).json({
    success: true,
    message: 'Alert marked as read',
    data: alert,
  });
};

export const dismissAlert = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const { alertId } = req.params;
  const alert = await stockAlertService.dismissAlert(alertId, sellerId);

  res.status(200).json({
    success: true,
    message: 'Alert dismissed',
    data: alert,
  });
};
