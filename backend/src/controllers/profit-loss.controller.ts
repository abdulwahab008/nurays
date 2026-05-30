import { Request, Response } from 'express';
import * as profitLossService from '../services/profit-loss.service';
import { AppError } from '../middleware/errorHandler';

export const getProfitLoss = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const filters = {
    startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
    endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
  };

  const profitLoss = await profitLossService.getSellerProfitLoss(req.user.userId, filters);

  res.status(200).json({
    success: true,
    data: profitLoss,
  });
};

export const getProductProfitability = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { productId } = req.params;
  const profitability = await profitLossService.getProductProfitability(req.user.userId, productId);

  res.status(200).json({
    success: true,
    data: profitability,
  });
};
