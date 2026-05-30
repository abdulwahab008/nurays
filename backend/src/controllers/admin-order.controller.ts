import { Request, Response } from 'express';
import adminOrderService from '../services/admin-order.service';
import { AppError } from '../middleware/errorHandler';

export const getAllOrders = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
    orderStatus: req.query.orderStatus as string | undefined,
    paymentStatus: req.query.paymentStatus as string | undefined,
    customerId: req.query.customerId as string | undefined,
    sellerId: req.query.sellerId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    orderNumber: req.query.orderNumber as string | undefined,
  };

  const result = await adminOrderService.getAllOrders(filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getOrderDetails = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const order = await adminOrderService.getOrderDetails(id);

  res.status(200).json({
    success: true,
    data: order,
  });
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { status, notes } = req.body;

  const order = await adminOrderService.updateOrderStatus(id, req.user.userId, status, notes);

  res.status(200).json({
    success: true,
    message: 'Order status updated',
    data: order,
  });
};

export const cancelOrder = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { reason } = req.body;

  const result = await adminOrderService.cancelOrder(id, req.user.userId, reason);

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully',
    data: result,
  });
};

export const processRefund = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { refundAmount } = req.body;

  const result = await adminOrderService.processRefund(id, req.user.userId, refundAmount);

  res.status(200).json({
    success: true,
    message: 'Refund processed successfully',
    data: result,
  });
};

export const getPlatformAnalytics = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };

  const analytics = await adminOrderService.getPlatformAnalytics(filters);

  res.status(200).json({
    success: true,
    data: analytics,
  });
};

export const getOrderStatistics = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const statistics = await adminOrderService.getOrderStatistics();

  res.status(200).json({
    success: true,
    data: statistics,
  });
};

