import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../utils/logger';

/**
 * The audit trail of admin changes: refunds, cancellations, payouts, seller and rider
 * decisions, settings. Every non-GET request on an admin router is recorded once its response
 * has been sent: who, which action on which record, the fields they sent and the outcome
 * (failed attempts too). Reads are not recorded.
 */

const SECRET_FIELD = /^(password|newPassword|currentPassword|otp|otpCode|token|refreshToken|secret|handoverCode)$/i;
const MAX_STRING = 500;
const MAX_KEYS = 50;

function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (depth >= 3) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[key] = SECRET_FIELD.test(key) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * The route's parameters, read from the URL. (req.params can't be used: Express resets it
 * when a handler fails, before the response is sent.) Admin routes are plain
 * "/segment/:param/segment" patterns matched against the end of the URL path.
 */
function routeParams(routePath: string, originalUrl: string): Record<string, string> {
  const pattern = routePath.split('/').filter(Boolean);
  const actual = originalUrl.split('?')[0].split('/').filter(Boolean).slice(-pattern.length);
  const params: Record<string, string> = {};
  if (actual.length !== pattern.length) return params;
  pattern.forEach((segment, i) => {
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual[i]);
  });
  return params;
}

/** Write one audit row. Never throws: an audit failure must not fail what it records. */
export function recordAudit(entry: {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  data?: unknown;
  responseStatus?: number | null;
}) {
  const body = entry.data && typeof entry.data === 'object' ? sanitize(entry.data) : undefined;
  return prisma.auditLog
    .create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        ...(body !== undefined ? { requestData: body as Prisma.InputJsonValue } : {}),
        responseStatus: entry.responseStatus ?? null,
      },
    })
    .catch((err) => logger.error({ err }, 'Could not write the audit log'));
}

/**
 * Put first on an admin router, before authenticate: records a request refused with 401 or 403
 * (no or bad token, or not an admin), so probing the admin area leaves a trail. Any method.
 */
export function auditDenied(area: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode !== 401 && res.statusCode !== 403) return;
      const marked = req as Request & { auditRecorded?: boolean };
      if (marked.auditRecorded) return;
      marked.auditRecorded = true;
      const path = req.originalUrl.split('?')[0];
      void recordAudit({
        userId: req.user?.userId ?? null,
        action: `${area}:DENIED ${req.method} ${path}`,
        entityType: 'access',
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent'),
        responseStatus: res.statusCode,
      });
    });
    next();
  };
}

export function auditWrites(area: string, opts: { onlyAdmins?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    // Routes shared with other roles (a seller's orders, a hub's stock) record only an admin acting on them.
    if (opts.onlyAdmins && req.user?.userType !== 'admin') return next();
    // Several admin routers share a mount point: a request passing through more than one is
    // still recorded once.
    const marked = req as Request & { auditRecorded?: boolean };
    if (marked.auditRecorded) return next();
    marked.auditRecorded = true;
    res.on('finish', () => {
      const routePath: string = req.route?.path ?? req.path;
      const params = routeParams(routePath, req.originalUrl);
      const entityId = params.id ?? params.refundId ?? Object.values(params)[0] ?? null;
      const body = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0 ? sanitize(req.body) : undefined;
      prisma.auditLog
        .create({
          data: {
            userId: req.user?.userId ?? null,
            action: `${area}:${req.method} ${routePath}`,
            entityType: routePath.split('/').filter(Boolean)[0] ?? null,
            entityId,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
            ...(body !== undefined ? { requestData: body as Prisma.InputJsonValue } : {}),
            responseStatus: res.statusCode,
          },
        })
        .catch((err) => logger.error({ err }, 'Could not write the audit log'));
    });
    next();
  };
}
