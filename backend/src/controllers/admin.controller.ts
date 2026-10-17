import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import adminService from '../services/admin.service';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { pageArgs } from '../utils/pagination';
import * as auditLogService from '../services/audit-log.service';

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
    status: qstr(req.query.status),
    verificationStatus: qstr(req.query.verificationStatus),
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

export const updateSellerStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await adminService.updateSellerStatus(id, status);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getPendingRiders = async (_req: Request, res: Response) => {
  const riders = await adminService.getPendingRiders();

  res.status(200).json({
    success: true,
    data: riders,
  });
};

export const approveRejectRider = async (req: Request, res: Response) => {
  const { id } = req.params;
  const action = req.path.includes('/reject') ? false : true;
  const { approved, reason } = req.body;
  const isApproved = approved !== undefined ? approved : action;

  const result = await adminService.approveRejectRider(id, isApproved, reason);

  res.status(200).json({
    success: true,
    data: result,
    message: result.message,
  });
};

export const getPayouts = async (req: Request, res: Response) => {
  const filters = {
    status: qstr(req.query.status),
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  };

  const result = await adminService.getPayouts(filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const completePayout = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { transactionId } = req.body;

  const result = await adminService.completePayout(id, transactionId);

  res.status(200).json({
    success: true,
    data: result,
    message: 'Payout marked as completed',
  });
};

export const failPayout = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await adminService.failPayout(id, reason);

  res.status(200).json({
    success: true,
    data: result,
    message: 'Payout marked as failed',
  });
};

export const getSettings = async (_req: Request, res: Response) => {
  const settings = await adminService.getSettings();

  res.status(200).json({
    success: true,
    data: settings,
  });
};

export const updateSettings = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const settings = await adminService.updateSettings(req.body, req.user.userId);

  res.status(200).json({
    success: true,
    data: settings,
    message: 'Settings updated successfully',
  });
};

export const getProductsForModeration = async (req: Request, res: Response) => {
  const filters = {
    status: qstr(req.query.moderationStatus) || qstr(req.query.status),
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
  };

  const result = await adminService.getProductsForModeration(filters);

  res.status(200).json({
    success: true,
    data: result,
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


/** The audit trail as a CSV file (at most 5,000 rows, same filters). The export itself is recorded. */
export const exportAuditLogs = async (req: Request, res: Response) => {
  const { csv, rows } = await auditLogService.auditLogsCsv(req.query);
  void recordAudit({ userId: req.user?.userId, action: 'admin:EXPORT audit-logs', entityType: 'audit-logs', ipAddress: req.ip, userAgent: req.get('user-agent'), data: { rows, filters: req.query }, responseStatus: 200 });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.status(200).send(csv);
};

/** The audit trail of admin changes, newest first, filterable by record, admin, action, date and result. */
export const getAuditLogs = async (req: Request, res: Response) => {
  const data = await auditLogService.listAuditLogs(req.query, pageArgs(req.query.page, req.query.limit, 50));
  res.status(200).json({ success: true, data });
};
