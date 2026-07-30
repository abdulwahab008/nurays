import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { AppError } from './errorHandler';
import prisma from '../config/database';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & {
        id: string;
      };
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'NO_TOKEN');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = verifyToken(token);

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, status: true, userType: true },
    });

    if (!user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    if (user.status !== 'active') {
      throw new AppError(`Account is ${user.status}`, 403, 'ACCOUNT_SUSPENDED');
    }

    // Attach user to request — use the freshly-fetched userType, not the JWT's
    // payload.userType, which is a snapshot from whenever the token was issued
    // and goes stale the moment a role changes (e.g. a seller application
    // getting approved) until the token is reissued.
    req.user = {
      ...payload,
      userType: user.userType,
      id: payload.userId,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
    }
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, status: true, userType: true },
      });

      if (user && user.status === 'active') {
        req.user = {
          ...payload,
          userType: user.userType,
          id: payload.userId,
        };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    if (!allowedRoles.includes(req.user.userType)) {
      throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    next();
  };
};

/**
 * Seller middleware - ensures user is a seller and loads seller data
 */
export const requireSeller = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    if (req.user.userType !== 'seller') {
      throw new AppError('Seller access required', 403, 'SELLER_REQUIRED');
    }

    // Load seller data
    const seller = await prisma.seller.findUnique({
      where: { userId: req.user.id },
      select: { id: true, businessName: true, status: true, verificationStatus: true },
    });

    if (!seller) {
      throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
    }

    if (seller.verificationStatus !== 'approved') {
      throw new AppError('Seller account is not approved', 403, 'SELLER_NOT_APPROVED');
    }

    if (seller.status !== 'active') {
      throw new AppError(`Seller account is ${seller.status}`, 403, 'SELLER_ACCOUNT_INACTIVE');
    }

    // Attach seller to request
    (req as any).seller = seller;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Seller verification failed', 403, 'SELLER_VERIFICATION_FAILED'));
    }
  }
};

/**
 * Blocks a suspended/inactive seller from seller self-service routes
 * (products, orders, payouts, dashboard). Deliberately does NOT require
 * verificationStatus === 'approved' like requireSeller does — a seller still
 * awaiting approval must keep using their own dashboard/profile while pending.
 */
export const blockSuspendedSeller = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.user.id },
      select: { id: true, status: true },
    });

    if (seller && seller.status !== 'active') {
      throw new AppError(`Seller account is ${seller.status}`, 403, 'SELLER_ACCOUNT_INACTIVE');
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Seller status check failed', 403, 'SELLER_STATUS_CHECK_FAILED'));
    }
  }
};

