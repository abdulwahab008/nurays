import { Request, Response } from 'express';
import sellerOrderService from '../services/seller-order.service';
import { AppError } from '../middleware/errorHandler';
import { currentSellerId } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { orderMoney } from '../services/seller-balance.service';

export const getSellerOrders = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    page: req.query.page as number | undefined,
    limit: req.query.limit as number | undefined,
    status: req.query.status as string | undefined,
    orderStatus: req.query.orderStatus as string | undefined,
    view: req.query.view as 'active' | 'delivered' | 'cancelled' | undefined,
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

/** Where this order's money is: earned, cash handed in, in which payout, sent, received. */
export const getSellerOrderMoney = async (req: Request, res: Response) => {
  const money = await orderMoney(prisma, await currentSellerId(req), String(req.params.id));
  if (!money) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  res.status(200).json({ success: true, data: money });
};

export const updateOrderItemStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { status, reason, handoverCode } = req.body;

  const item = await sellerOrderService.updateOrderItemStatus(id, req.user.userId, status, reason, handoverCode);

  res.status(200).json({
    success: true,
    message: 'Order item status updated',
    data: item,
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

export const acceptOrder = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const preparationTime = (req.body as { preparationTime?: number } | undefined)?.preparationTime;
  const result = await sellerOrderService.acceptOrder(id, req.user.userId, preparationTime);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
};

export const rejectOrder = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { reason } = req.body;

  const result = await sellerOrderService.rejectOrder(id, req.user.userId, reason);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
};

export const markOrderReady = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const result = await sellerOrderService.markOrderReady(id, req.user.userId);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
};

/**
 * Self-delivery / pickup handover for the whole order.
 * POST /seller/orders/:id/dispatch | /deliver { handoverCode } | /delivery-failed { reason }
 */
const selfHandoverAction = (action: 'dispatch' | 'deliver' | 'fail') => async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const result = await sellerOrderService.selfHandover(req.params.id, req.user.userId, action, {
    handoverCode: req.body?.handoverCode,
    reason: req.body?.reason,
  });
  res.status(200).json({ success: true, data: result });
};
export const dispatchOrder = selfHandoverAction('dispatch');
export const deliverOrder = selfHandoverAction('deliver');
export const reportDeliveryFailed = selfHandoverAction('fail');

