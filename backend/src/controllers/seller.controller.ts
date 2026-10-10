import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import sellerService from '../services/seller.service';
import * as publicSellerService from '../services/public-seller.service';
import { AppError } from '../middleware/errorHandler';
import { currentSellerId } from '../middleware/auth.middleware';

export const getCurrentSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await sellerService.getSellerProfile(req.user.userId);

  res.status(200).json({
    success: true,
    data: profile,
  });
};

export const updateCurrentSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const profile = await sellerService.updateSellerProfile(req.user.userId, req.body);

  res.status(200).json({
    success: true,
    data: profile,
    message: 'Seller profile updated successfully',
  });
};

export const getCommunityDelivery = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = await sellerService.getCommunityDelivery(req.user.userId);

  res.status(200).json({ success: true, data });
};

export const setCommunityDelivery = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const data = await sellerService.setCommunityDelivery(req.user.userId, req.body.terms);

  res.status(200).json({
    success: true,
    data,
    message: 'Community delivery terms saved',
  });
};

export const registerAsSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // The service refuses a second application (400 SELLER_ALREADY_EXISTS) unless the first was rejected.
  const result = await sellerService.registerAsSeller(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Application submitted for review',
  });
};

export const getSellerDashboard = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const dashboard = await sellerService.getSellerDashboard(sellerId);

  res.status(200).json({
    success: true,
    data: dashboard,
  });
};

export const getSellerAnalytics = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const period = qstr(req.query.period) || '30d';
  const analytics = await sellerService.getSellerAnalytics(sellerId, period);

  res.status(200).json({
    success: true,
    data: analytics,
  });
};

export const requestPayout = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const result = await sellerService.requestPayout(sellerId, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Payout request submitted successfully',
  });
};

export const getPayoutHistory = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const payouts = await sellerService.getPayoutHistory(sellerId);

  res.status(200).json({
    success: true,
    data: payouts,
  });
};

export const toggleStoreLive = async (req: Request, res: Response) => {
  const sellerId = await currentSellerId(req);

  const result = await sellerService.toggleStoreStatus(sellerId);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getPublicSellers = async (req: Request, res: Response) => {
  const formatted = await publicSellerService.listPublicSellers(req.query);

  res.status(200).json({
    success: true,
    data: formatted,
    count: formatted.length,
  });
};

export const getPublicSellerById = async (req: Request, res: Response) => {
  const result = await publicSellerService.getPublicSeller(req.params.id);

  res.status(200).json({
    success: true,
    data: result,
  });
};


