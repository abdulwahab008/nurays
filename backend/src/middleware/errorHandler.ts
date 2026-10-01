import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Known library errors a client caused, translated to the right 4xx instead of a
 * blanket 500: a unique-constraint hit (now common — reviews, promo usage, SKUs),
 * a missing record, a malformed or oversized body, an upload over the size limit.
 * Anything unrecognised is returned unchanged and handled as a real 500.
 */
export const toAppError = (err: any): Error | AppError => {
  if (err instanceof AppError) return err;

  // Prisma (identified by shape so this file needn't import the client)
  if (typeof err?.code === 'string' && /^P\d{4}$/.test(err.code) && err.clientVersion) {
    if (err.code === 'P2002') {
      return new AppError('This record already exists', 409, 'DUPLICATE_RECORD');
    }
    if (err.code === 'P2003') {
      return new AppError('A referenced record does not exist', 400, 'INVALID_REFERENCE');
    }
    if (err.code === 'P2025') {
      return new AppError('Record not found', 404, 'NOT_FOUND');
    }
  }

  // body-parser
  if (err?.type === 'entity.too.large') {
    return new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  if (err?.type === 'entity.parse.failed') {
    return new AppError('Request body is not valid JSON', 400, 'INVALID_JSON');
  }

  // multer
  if (err?.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError('File is too large', 413, 'FILE_TOO_LARGE')
      : new AppError(err.message || 'Invalid upload', 400, 'INVALID_UPLOAD');
  }

  return err;
};

export const errorHandler = (
  rawErr: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const err = toAppError(rawErr);
  // Handle AppError
  if (err instanceof AppError) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Log error (in production, use proper logging service)
    console.error('Error:', {
      message: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method
    });

    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: message,
        ...(err.details && { details: err.details }),
        ...(process.env.NODE_ENV === 'development' && err.stack && { stack: err.stack })
      },
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle other errors
  console.error('Unexpected Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
};

