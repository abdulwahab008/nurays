import { Request, Response } from 'express';
import { qstr } from '../utils/query';
import adminService from '../services/admin.service';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';

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


const auditFilter = (query: Request['query']) => {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const date = (v: unknown) => {
    const s = str(v);
    if (!s) return undefined;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new AppError('Invalid date', 400, 'VALIDATION_ERROR');
    return d;
  };
  const from = date(query.dateFrom);
  const to = date(query.dateTo);
  const result = str(query.result);
  return {
    ...(str(query.entityType) ? { entityType: str(query.entityType) } : {}),
    ...(str(query.entityId) ? { entityId: str(query.entityId) } : {}),
    ...(str(query.userId) ? { userId: str(query.userId) } : {}),
    ...(str(query.action) ? { action: { contains: str(query.action)!, mode: 'insensitive' as const } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    // result: ok (2xx/3xx), refused (4xx/5xx)
    ...(result === 'ok' ? { responseStatus: { lt: 400 } } : result === 'refused' ? { responseStatus: { gte: 400 } } : {}),
  };
};

/** The audit trail as a CSV file (at most 5,000 rows, same filters). The export itself is recorded. */
export const exportAuditLogs = async (req: Request, res: Response) => {
  const where = auditFilter(req.query);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { user: { select: { email: true } } },
  });
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lines = [['time', 'admin', 'action', 'record_type', 'record_id', 'status', 'ip', 'details'].join(',')].concat(
    rows.map((l) => [l.createdAt.toISOString(), l.user?.email, l.action, l.entityType, l.entityId, l.responseStatus, l.ipAddress, l.requestData ? JSON.stringify(l.requestData) : ''].map(cell).join(','))
  );
  void recordAudit({ userId: req.user?.userId, action: 'admin:EXPORT audit-logs', entityType: 'audit-logs', ipAddress: req.ip, userAgent: req.get('user-agent'), data: { rows: rows.length, filters: req.query }, responseStatus: 200 });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.status(200).send(lines.join('\n'));
};

/** The audit trail of admin changes, newest first, filterable by record, admin, action, date and result. */
export const getAuditLogs = async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
  const where = auditFilter(req.query);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, profile: { select: { fullName: true } } } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.status(200).json({
    success: true,
    data: {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        responseStatus: l.responseStatus,
        requestData: l.requestData,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
        admin: l.user ? { id: l.user.id, name: l.user.profile?.fullName ?? null, email: l.user.email } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
};
