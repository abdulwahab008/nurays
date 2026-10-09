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
  requestPhoneVerification,
  verifyPhone,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import {
  requestOTPSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  refreshTokenSchema,
  requestPhoneVerificationSchema,
  verifyPhoneSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleLoginSchema,
} from '../validators/auth.validator';
import { authenticate } from '../middleware/auth.middleware';
import { loginLimiter, otpLimiter, registerLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes
router.post('/otp/request', otpLimiter, validate(requestOTPSchema), requestOTP);
router.post('/register', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/google', loginLimiter, validate(googleLoginSchema), loginWithGoogle);
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/forgot-password', otpLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/resend-verification', authenticate, resendVerificationEmail);
router.post('/logout', authenticate, logout);

// Phone verification for the signed-in account (also how an account adds a real number)
router.post('/phone/request', authenticate, otpLimiter, validate(requestPhoneVerificationSchema), requestPhoneVerification);
router.post('/phone/verify', authenticate, loginLimiter, validate(verifyPhoneSchema), verifyPhone);

export default router;

