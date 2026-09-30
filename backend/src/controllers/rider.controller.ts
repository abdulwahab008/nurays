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
  const delivery = await riderService.claimDelivery(req.user.userId, req.params.id, req.body?.askFee);
  res.status(200).json({ success: true, data: delivery });
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const delivery = await riderService.updateDeliveryStatus(
    req.user.userId,
    req.params.id,
    req.body.status,
    req.body.reason,
    req.body.otp
  );
  res.status(200).json({ success: true, data: delivery });
};

export const getRiderProfile = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const profile = await riderService.getRiderProfile(req.user.userId);
  res.status(200).json({ success: true, data: profile });
};

export const toggleDutyStatus = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const result = await riderService.toggleDutyStatus(req.user.userId, req.body.isAvailable);
  res.status(200).json({ success: true, data: result });
};

export const updateRiderLocation = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const { latitude, longitude } = req.body;
  if (latitude == null || longitude == null || isNaN(Number(latitude)) || isNaN(Number(longitude))) {
    throw new AppError('Valid numeric latitude and longitude are required', 400, 'INVALID_COORDINATES');
  }
  const result = await riderService.updateRiderLocation(
    req.user.userId,
    req.params.id,
    Number(latitude),
    Number(longitude)
  );
  res.status(200).json({ success: true, data: result });
};

