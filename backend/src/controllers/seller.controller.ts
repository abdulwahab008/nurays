import { Request, Response } from 'express';
import sellerService from '../services/seller.service';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';

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

export const registerAsSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (seller) {
    throw new AppError('Seller account already exists', 400, 'SELLER_ALREADY_EXISTS');
  }

  const result = await sellerService.registerAsSeller(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Application submitted for review',
  });
};

export const getSellerDashboard = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const dashboard = await sellerService.getSellerDashboard(seller.id);

  res.status(200).json({
    success: true,
    data: dashboard,
  });
};

export const getSellerAnalytics = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const period = (req.query.period as string) || '30d';
  const analytics = await sellerService.getSellerAnalytics(seller.id, period);

  res.status(200).json({
    success: true,
    data: analytics,
  });
};

export const requestPayout = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Get seller ID from user
  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const result = await sellerService.requestPayout(seller.id, req.body);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Payout request submitted successfully',
  });
};

export const getPayoutHistory = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const seller = await prisma.seller.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!seller) {
    throw new AppError('Seller account not found', 404, 'SELLER_NOT_FOUND');
  }

  const payouts = await sellerService.getPayoutHistory(seller.id);

  res.status(200).json({
    success: true,
    data: payouts,
  });
};

