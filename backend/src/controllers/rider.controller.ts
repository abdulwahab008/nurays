import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import riderService from '../services/rider.service';

export const getAvailableDeliveries = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const deliveries = await riderService.getAvailableDeliveries(req.user.userId);
  res.status(200).json({ success: true, data: deliveries });
};

export const getMyDeliveries = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const deliveries = await riderService.getMyDeliveries(req.user.userId);
  res.status(200).json({ success: true, data: deliveries });
};

export const claimDelivery = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const delivery = await riderService.claimDelivery(req.user.userId, req.params.id);
  res.status(200).json({ success: true, data: delivery });
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const delivery = await riderService.updateDeliveryStatus(req.user.userId, req.params.id, req.body.status);
  res.status(200).json({ success: true, data: delivery });
};
