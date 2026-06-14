import { Request, Response } from 'express';
import favoriteService from '../services/favorite.service';
import { AppError } from '../middleware/errorHandler';

export const getFavorites = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const data = await favoriteService.list(req.user.userId);
  res.status(200).json({ success: true, data });
};

export const getFavoriteIds = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const data = await favoriteService.ids(req.user.userId);
  res.status(200).json({ success: true, data });
};

export const addFavorite = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const productId = req.body?.productId;
  if (!productId || typeof productId !== 'string') {
    throw new AppError('productId is required', 400, 'PRODUCT_ID_REQUIRED');
  }
  const data = await favoriteService.add(req.user.userId, productId);
  res.status(201).json({ success: true, data });
};

export const removeFavorite = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const data = await favoriteService.remove(req.user.userId, req.params.productId);
  res.status(200).json({ success: true, data });
};
