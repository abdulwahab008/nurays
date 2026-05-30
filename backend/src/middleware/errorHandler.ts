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

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
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

