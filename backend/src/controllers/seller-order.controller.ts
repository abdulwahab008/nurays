import { Request, Response } from 'express';
import sellerOrderService from '../services/seller-order.service';
import { AppError } from '../middleware/errorHandler';

export const getSellerOrders = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
    status: req.query.status as string | undefined,
    orderStatus: req.query.orderStatus as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };

  const result = await sellerOrderService.getSellerOrders(req.user.userId, filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getSellerOrderDetails = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const order = await sellerOrderService.getSellerOrderDetails(id, req.user.userId);

  res.status(200).json({
    success: true,
    data: order,
  });
};

export const updateOrderItemStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { status } = req.body;

  const item = await sellerOrderService.updateOrderItemStatus(id, req.user.userId, status);

  res.status(200).json({
    success: true,
    message: 'Order item status updated',
    data: item,
  });
};

export const getSellerDashboard = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const dashboard = await sellerOrderService.getSellerDashboard(req.user.userId);

  res.status(200).json({
    success: true,
    data: dashboard,
  });
};

export const cancelOrderItem = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { reason } = req.body;

  const result = await sellerOrderService.cancelOrderItem(id, req.user.userId, reason);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
};

