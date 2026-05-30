import { Request, Response } from 'express';
import adminService from '../services/admin.service';
import { AppError } from '../middleware/errorHandler';

export const getPendingSellers = async (_req: Request, res: Response) => {
  const sellers = await adminService.getPendingSellers();

  res.status(200).json({
    success: true,
    data: sellers,
  });
};

export const getSellerById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const seller = await adminService.getSellerById(id);

  res.status(200).json({
    success: true,
    data: seller,
  });
};

export const getAllSellers = async (req: Request, res: Response) => {
  const filters = {
    status: req.query.status as string | undefined,
    verificationStatus: req.query.verificationStatus as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  };

  const result = await adminService.getAllSellers(filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const approveRejectSeller = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const action = req.path.includes('/reject') ? false : true; // Check if route is /reject
  const { approved, notes, reason } = req.body;
  
  // Use approved from body if provided, otherwise use action from route
  const isApproved = approved !== undefined ? approved : action;

  const result = await adminService.approveRejectSeller(id, req.user.userId, isApproved, notes || reason);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const moderateProduct = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const { id } = req.params;
  const { approved, reason } = req.body;

  const result = await adminService.moderateProduct(id, req.user.userId, approved, reason);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

