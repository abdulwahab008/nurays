import { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';

/**
 * Text no database column can hold: a NUL byte (PostgreSQL refuses it) or an unpaired UTF-16 surrogate (it cannot be
 * written as UTF-8). Either one reaching Prisma fails the query as a 500, and Prisma sends look-ups of the same shape
 * as one statement, so one such request would also fail the well-formed ones it was batched with.
 */
// eslint-disable-next-line no-control-regex -- the NUL byte is exactly what this looks for
const UNSAFE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True when a string, or any key or string inside an object or array, holds text that cannot be stored. */
export function hasUnsafeText(value: unknown): boolean {
  // No recursion: a body can nest as deep as its size limit allows.
  const todo: unknown[] = [value];
  while (todo.length) {
    const v = todo.pop();
    if (typeof v === 'string') {
      if (UNSAFE.test(v)) return true;
    } else if (Array.isArray(v)) {
      todo.push(...v);
    } else if (v !== null && typeof v === 'object') {
      for (const [key, inner] of Object.entries(v)) {
        if (UNSAFE.test(key)) return true;
        todo.push(inner);
      }
    }
  }
  return false;
}

const refuse = () => new AppError('The request contains characters that are not allowed', 400, 'INVALID_CHARACTERS');

/**
 * Refuses a request whose path, query string, JSON or form body, or uploaded file names carry text that cannot be
 * stored (see UNSAFE). Mount it after the body parsers; use it again after multer on a route that takes uploads.
 */
export function rejectUnsafeText(req: Request, _res: Response, next: NextFunction): void {
  // A NUL in the path arrives as %00; a lone surrogate cannot be written as valid percent-encoded UTF-8 at all.
  if (/%00/i.test(req.originalUrl)) throw refuse();
  if (hasUnsafeText(req.query) || hasUnsafeText(req.body)) throw refuse();
  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : req.file ? [req.file] : [];
  if (files.some((f) => UNSAFE.test(f.originalname) || UNSAFE.test(f.fieldname))) throw refuse();
  next();
}
