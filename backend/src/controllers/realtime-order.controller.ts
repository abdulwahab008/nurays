import { Request, Response } from 'express';
import realtimeOrderService from '../services/realtime-order.service';
import { AppError } from '../middleware/errorHandler';

export const getOrderTracking = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const tracking = await realtimeOrderService.getOrderTracking(id, req.user.userId);

  res.status(200).json({
    success: true,
    data: tracking,
  });
};

