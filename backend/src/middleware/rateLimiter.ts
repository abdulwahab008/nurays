import rateLimit from 'express-rate-limit';

// Brute-force protection on login: same IP can't hammer credentials.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' } },
});

// OTP requests cost real SMS credits — keep this tight.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many OTP requests. Please try again later.', code: 'RATE_LIMITED' } },
});

// Prevent scripted mass account creation from one IP.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many registration attempts. Please try again later.', code: 'RATE_LIMITED' } },
});

// Prevent brute-forcing/guessing promo codes.
export const promoValidateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many attempts. Please slow down.', code: 'RATE_LIMITED' } },
});
