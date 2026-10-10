import { Request, Response } from 'express';
import adminOrderService from '../services/admin-order.service';
import orderService from '../services/order.service';
import { AppError } from '../middleware/errorHandler';
import { completeRefund as completeRefundRecord, dismissRefund as dismissRefundRecord, listRefunds as listRefundRecords } from '../services/refund.service';

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

export const retryDelivery = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const result = await adminOrderService.retryDelivery(id, req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Delivery sent back out for dispatch',
    data: result,
  });
};

export const processRefund = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { refundAmount, reason } = req.body;

  const result = await adminOrderService.processRefund(id, req.user.userId, refundAmount, reason);

  res.status(200).json({
    success: true,
    message: 'Refund processed successfully',
    data: result,
  });
};

export const listRefunds = async (req: Request, res: Response) => {
  const result = await listRefundRecords({
    status: req.query.status as string | undefined,
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
  });

  res.status(200).json({ success: true, data: result });
};

export const completeRefund = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const refund = await completeRefundRecord(req.params.refundId, req.user.userId, req.body.reference);

  res.status(200).json({
    success: true,
    message: 'Refund marked as sent',
    data: { ...refund, amount: Number(refund.amount) },
  });
};

export const dismissRefund = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const refund = await dismissRefundRecord(req.params.refundId, req.user.userId, req.body.reason);

  res.status(200).json({
    success: true,
    message: 'Refund dismissed',
    data: { ...refund, amount: Number(refund.amount) },
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


export const confirmTransfer = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const result = await orderService.adminConfirmManualPayment(req.params.id, req.user.userId, req.body?.note);
  res.status(200).json({ success: true, message: 'Payment confirmed', data: result });
};
