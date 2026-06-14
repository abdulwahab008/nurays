import { Request, Response } from 'express';
import riderService from '../services/rider.service';
import { AppError } from '../middleware/errorHandler';

function uid(req: Request): string {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
}

export const getAvailableDeliveries = async (req: Request, res: Response) => {
  const data = await riderService.getAvailableDeliveries(uid(req));
  res.status(200).json({ success: true, data });
};

export const getMyDeliveries = async (req: Request, res: Response) => {
  const data = await riderService.getMyDeliveries(uid(req));
  res.status(200).json({ success: true, data });
};

export const acceptDelivery = async (req: Request, res: Response) => {
  const data = await riderService.acceptDelivery(uid(req), req.params.orderId);
  res.status(200).json({ success: true, message: 'Delivery accepted', data });
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  const data = await riderService.updateDeliveryStatus(uid(req), req.params.orderId, req.body?.status);
  res.status(200).json({ success: true, data });
};

export const pushLocation = async (req: Request, res: Response) => {
  const { orderId, latitude, longitude } = req.body ?? {};
  const data = await riderService.pushLocation(uid(req), orderId, Number(latitude), Number(longitude));
  res.status(200).json({ success: true, data });
};
