import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { can, permissionForRequest, Permission } from '../utils/permissions';

const deny = (permission: Permission) =>
  new AppError('Your staff role does not allow this action', 403, 'INSUFFICIENT_STAFF_ROLE', { permission });

/** On the admin routers, after authorize('admin'): checks the route against the staff role's permissions. */
export const enforceStaffPermissions = (req: Request, _res: Response, next: NextFunction) => {
  const permission = permissionForRequest(req.method, req.path);
  if (!can(req.user?.staffRole, permission)) return next(deny(permission));
  next();
};

/** A route that needs one named permission (staff only). */
export const requirePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.userType !== 'admin' || !can(req.user.staffRole, permission)) return next(deny(permission));
  next();
};

/**
 * For a route shared with other roles (a hub's stock, a kitchen's orders): staff need the permission,
 * everyone else is left to the route's own checks.
 */
export const ifStaffRequire = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.userType === 'admin' && !can(req.user.staffRole, permission)) return next(deny(permission));
  next();
};
