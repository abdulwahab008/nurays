import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

/** What an audit-trail page's filters (the address bar's query) ask for: a record, an admin, an action, a date range, a result. */
export const auditFilter = (query: Record<string, unknown>) => {
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

/** One page of the audit trail, newest first. */
export async function listAuditLogs(query: Record<string, unknown>, { page, limit, skip }: { page: number; limit: number; skip: number }) {
  const where = auditFilter(query);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { id: true, email: true, profile: { select: { fullName: true } } } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
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
  };
}

/** The audit trail as CSV text (at most 5,000 rows, newest first, same filters), and how many rows it holds. */
export async function auditLogsCsv(query: Record<string, unknown>): Promise<{ csv: string; rows: number }> {
  const where = auditFilter(query);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { user: { select: { email: true } } },
  });
  // A cell that starts like a formula gets a leading apostrophe, so a spreadsheet shows it as text.
  const cell = (v: unknown) => {
    let text = String(v ?? '').replace(/\r?\n/g, ' ');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [['time', 'admin', 'action', 'record_type', 'record_id', 'status', 'ip', 'details'].join(',')].concat(
    rows.map((l) => [l.createdAt.toISOString(), l.user?.email, l.action, l.entityType, l.entityId, l.responseStatus, l.ipAddress, l.requestData ? JSON.stringify(l.requestData) : ''].map(cell).join(','))
  );
  return { csv: lines.join('\n'), rows: rows.length };
}
