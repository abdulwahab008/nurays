import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { Request, Response } from 'express';

// Disabled in tests so Jest/E2E runs aren't throttled.
const DISABLED = process.env.NODE_ENV === 'test';

function rejection(code: string, message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    });
  };
}

function makeLimiter(opts: Partial<Options> & { windowMs: number; limit: number; code: string; message: string }) {
  const { code, message, ...rest } = opts;
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => DISABLED,
    handler: rejection(code, message),
    ...rest,
  });
}

// Login / register / email-verify: protect against credential brute force.
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// OTP request: stricter, and keyed by phone (falling back to IP) so one
// number can't be spammed with SMS regardless of source IP.
export const otpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  code: 'TOO_MANY_OTP_REQUESTS',
  message: 'Too many OTP requests. Please wait before requesting another code.',
  keyGenerator: (req: Request) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    return phone || ipKeyGenerator(req.ip ?? '');
  },
});

// Promotion code validation: stop attackers from brute-forcing valid codes.
export const promoLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many promo code attempts. Please wait and try again.',
});
