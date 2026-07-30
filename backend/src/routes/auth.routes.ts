import { Router } from 'express';
import {
  requestOTP,
  register,
  login,
  loginWithGoogle,
  verifyEmail,
  resendVerificationEmail,
  refreshToken,
  getCurrentUser,
  logout,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import {
  requestOTPSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';
import { authenticate } from '../middleware/auth.middleware';
import { loginLimiter, otpLimiter, registerLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes
router.post('/otp/request', otpLimiter, validate(requestOTPSchema), requestOTP);
router.post('/register', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/google', loginWithGoogle); // Google OAuth - no validation needed, handled in service
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/resend-verification', authenticate, resendVerificationEmail);
router.post('/logout', authenticate, logout);

export default router;

