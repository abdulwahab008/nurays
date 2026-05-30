import { Request, Response } from 'express';
import prisma from '../config/database';
import promotionService from '../services/promotion.service';
import { AppError } from '../middleware/errorHandler';

export const validatePromotionCode = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { code, cartTotal } = req.body;
  const result = await promotionService.validatePromotionCode(req.user.userId, code, cartTotal);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getAvailablePromotions = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const promotions = await promotionService.getAvailablePromotions(req.user.userId);

  res.status(200).json({
    success: true,
    data: promotions,
  });
};

/** Get promotions per product for catalog (public, for customer product listing) */
export const getCatalogPromotions = async (req: Request, res: Response) => {
  const productIds = (req.query.productIds as string || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const data = await promotionService.getPromotionsForCatalog(productIds);
  res.status(200).json({ success: true, data });
};

/** Get current seller's promotions (seller only) */
export const listMyPromotions = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });
  if (!seller) throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');

  const promotions = await promotionService.listBySeller(seller.id);
  res.status(200).json({ success: true, data: promotions });
};

/** Create a promotion (seller only) */
export const createPromotion = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });
  if (!seller) throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');

  const promotion = await promotionService.createForSeller(seller.id, req.body);
  res.status(201).json({ success: true, data: promotion });
};

/** Get one promotion (seller only) */
export const getPromotion = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });
  if (!seller) throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');

  const promotion = await promotionService.getOneForSeller(seller.id, req.params.id);
  res.status(200).json({ success: true, data: promotion });
};

/** Update a promotion (seller only) */
export const updatePromotion = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });
  if (!seller) throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');

  const promotion = await promotionService.updateForSeller(seller.id, req.params.id, req.body);
  res.status(200).json({ success: true, data: promotion });
};

/** Delete a promotion (seller only) */
export const deletePromotion = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
  });
  if (!seller) throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');

  await promotionService.deleteForSeller(seller.id, req.params.id);
  res.status(200).json({ success: true, message: 'Promotion deleted' });
};

