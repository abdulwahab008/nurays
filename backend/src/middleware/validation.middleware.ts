import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * Validate request body against Zod schema
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body) as Request['body'];
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        const firstMessage = errors[0]?.message || 'Invalid request';
        throw new AppError(`Validation failed: ${firstMessage}`, 400, 'VALIDATION_ERROR', errors);
      }
      next(error);
    }
  };
};

/**
 * Validate request query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // The parsed result (with .transform()s applied — e.g. "2" -> 2, "a,b" -> ["a","b"])
      // must be written back; schema.parse() does not mutate req.query in place.
      // Express 5's req.query is a getter-only accessor (no setter) — a plain
      // assignment throws "Cannot set property query of #<IncomingMessage>
      // which has only a getter". Overriding it as an own property on this
      // request instance shadows the prototype getter instead.
      const parsedQuery = schema.parse(req.query);
      Object.defineProperty(req, 'query', {
        value: parsedQuery,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError('Query validation failed', 400, 'VALIDATION_ERROR', errors);
      }
      next(error);
    }
  };
};

/**
 * Validate request params
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError('Parameter validation failed', 400, 'VALIDATION_ERROR', errors);
      }
      next(error);
    }
  };
};

